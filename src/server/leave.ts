import "server-only";

import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  attendance,
  employees,
  holidays,
  leaveBalances,
  leaveRequests,
  leaveTypes,
  shifts,
} from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { eachDay, weekdayIndex } from "@/lib/time";

// Leave rules shared by the admin Leave screen and the staff app.

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Working days in a range for an employee: skips weekly offs and holidays. */
async function workingDays(
  employeeId: number,
  from: string,
  to: string,
  runner: typeof db | Tx = db,
): Promise<string[]> {
  const [emp] = await runner
    .select({ weeklyOffs: shifts.weeklyOffs })
    .from(employees)
    .leftJoin(shifts, eq(shifts.id, employees.shiftId))
    .where(eq(employees.id, employeeId));
  const offs = new Set(emp?.weeklyOffs ?? [0]);
  const hols = await runner
    .select({ date: holidays.date })
    .from(holidays)
    .where(and(gte(holidays.date, from), lte(holidays.date, to), eq(holidays.isOptional, false)));
  const holidaySet = new Set(hols.map((h) => h.date));
  return eachDay(from, to).filter((d) => !offs.has(weekdayIndex(d)) && !holidaySet.has(d));
}

/** Leave days a request will use (0.5 for a half-day). */
async function countLeaveDays(
  employeeId: number,
  from: string,
  to: string,
  halfDay: boolean,
): Promise<number> {
  const days = await workingDays(employeeId, from, to);
  if (halfDay) return days.length ? 0.5 : 0;
  return days.length;
}

export type BalanceRow = {
  leaveTypeId: number;
  code: string;
  name: string;
  isPaid: boolean;
  opening: number;
  credited: number;
  used: number;
  adjusted: number;
  available: number;
};

/** One employee's balances for a year, one row per active leave type. */
export async function getBalances(employeeId: number, year: number): Promise<BalanceRow[]> {
  const types = await db
    .select()
    .from(leaveTypes)
    .where(eq(leaveTypes.isActive, true))
    .orderBy(leaveTypes.code);
  const rows = await db
    .select()
    .from(leaveBalances)
    .where(and(eq(leaveBalances.employeeId, employeeId), eq(leaveBalances.year, year)));
  const byType = new Map(rows.map((r) => [r.leaveTypeId, r]));
  return types.map((t) => {
    const b = byType.get(t.id);
    const opening = b?.opening ?? 0;
    const credited = b?.credited ?? 0;
    const used = b?.used ?? 0;
    const adjusted = b?.adjusted ?? 0;
    return {
      leaveTypeId: t.id,
      code: t.code,
      name: t.name,
      isPaid: t.isPaid,
      opening,
      credited,
      used,
      adjusted,
      available: opening + credited + adjusted - used,
    };
  });
}

async function bumpUsed(tx: Tx, employeeId: number, leaveTypeId: number, year: number, delta: number) {
  await tx
    .insert(leaveBalances)
    .values({ employeeId, leaveTypeId, year, used: Math.max(0, delta) })
    .onDuplicateKeyUpdate({ set: { used: sql`GREATEST(0, ${leaveBalances.used} + ${delta})` } });
}

export async function approveLeaveRequest(id: number, approverId: number) {
  await db.transaction(async (tx) => {
    const req = await tx.query.leaveRequests.findFirst({ where: eq(leaveRequests.id, id) });
    if (!req) throw new Error("Leave request not found.");
    if (req.status !== "pending") throw new Error(`This request is already ${req.status}.`);

    const days = await workingDays(req.employeeId, req.fromDate, req.toDate, tx);
    await bumpUsed(tx, req.employeeId, req.leaveTypeId, Number(req.fromDate.slice(0, 4)), req.days);

    for (const date of days) {
      const status = req.halfDay ? "half_day" : "on_leave";
      await tx
        .insert(attendance)
        .values({ employeeId: req.employeeId, date, status, leaveRequestId: req.id, flags: { autoMarked: true } })
        .onDuplicateKeyUpdate({ set: { status, leaveRequestId: req.id } });
    }

    await tx
      .update(leaveRequests)
      .set({ status: "approved", approverId, decidedAt: new Date(), decisionRemark: null })
      .where(eq(leaveRequests.id, id));
  });
  await logAudit({ actorId: approverId, tableName: "leave_requests", recordId: id, action: "update", after: { status: "approved" } });
}

export async function rejectLeaveRequest(id: number, approverId: number, remark: string) {
  const req = await db.query.leaveRequests.findFirst({ where: eq(leaveRequests.id, id) });
  if (!req) throw new Error("Leave request not found.");
  if (req.status !== "pending") throw new Error(`This request is already ${req.status}.`);
  await db
    .update(leaveRequests)
    .set({ status: "rejected", approverId, decidedAt: new Date(), decisionRemark: remark })
    .where(eq(leaveRequests.id, id));
  await logAudit({ actorId: approverId, tableName: "leave_requests", recordId: id, action: "update", after: { status: "rejected" }, reason: remark });
}

/** Cancel approved leave that hasn't started: restores balance and clears the roster. */
export async function cancelApprovedLeave(id: number, actorId: number, today: string, remark?: string) {
  await db.transaction(async (tx) => {
    const req = await tx.query.leaveRequests.findFirst({ where: eq(leaveRequests.id, id) });
    if (!req) throw new Error("Leave request not found.");
    if (req.status !== "approved") throw new Error("Only approved leave can be cancelled.");
    if (req.fromDate <= today) throw new Error("Leave that has already started can't be cancelled.");
    await bumpUsed(tx, req.employeeId, req.leaveTypeId, Number(req.fromDate.slice(0, 4)), -req.days);
    await tx
      .delete(attendance)
      .where(and(eq(attendance.leaveRequestId, req.id), inArray(attendance.status, ["on_leave", "half_day"])));
    await tx
      .update(leaveRequests)
      .set({ status: "cancelled", decidedAt: new Date(), decisionRemark: remark ?? null })
      .where(eq(leaveRequests.id, id));
  });
  await logAudit({ actorId, tableName: "leave_requests", recordId: id, action: "update", after: { status: "cancelled" }, reason: remark });
}

/** Validate and create a leave request (used by staff app and admins). */
export async function createLeaveRequest(input: {
  employeeId: number;
  leaveTypeId: number;
  fromDate: string;
  toDate: string;
  halfDay: "first_half" | "second_half" | null;
  reason?: string | null;
}) {
  if (input.toDate < input.fromDate) throw new Error("End date is before start date.");
  if (input.halfDay && input.fromDate !== input.toDate) {
    throw new Error("A half-day must start and end on the same date.");
  }
  const days = await countLeaveDays(input.employeeId, input.fromDate, input.toDate, Boolean(input.halfDay));
  if (days <= 0) throw new Error("Those dates are all weekly offs or holidays.");

  const overlap = await db.query.leaveRequests.findFirst({
    where: and(
      eq(leaveRequests.employeeId, input.employeeId),
      inArray(leaveRequests.status, ["pending", "approved"]),
      lte(leaveRequests.fromDate, input.toDate),
      gte(leaveRequests.toDate, input.fromDate),
    ),
    columns: { id: true },
  });
  if (overlap) throw new Error("You already have leave pending or approved on these dates.");

  const type = await db.query.leaveTypes.findFirst({ where: eq(leaveTypes.id, input.leaveTypeId) });
  if (!type) throw new Error("Unknown leave type.");
  if (type.isPaid) {
    const bal = (await getBalances(input.employeeId, Number(input.fromDate.slice(0, 4)))).find(
      (b) => b.leaveTypeId === input.leaveTypeId,
    );
    if ((bal?.available ?? 0) < days) {
      throw new Error(`Not enough ${type.name} balance (${bal?.available ?? 0} left, ${days} needed).`);
    }
  }

  const [row] = await db
    .insert(leaveRequests)
    .values({ ...input, days, reason: input.reason ?? null })
    .$returningId();
  return { id: row.id, days };
}
