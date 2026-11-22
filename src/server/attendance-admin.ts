import "server-only";

import { and, asc, desc, eq, gte, inArray, lte, ne, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  type AttendanceFlags,
  type AttendanceStatus,
  attendance,
  departments,
  employees,
  holidays,
  leaveRequests,
  leaveTypes,
  regularisations,
  shifts,
} from "@/db/schema";
import { DEFAULT_SHIFT, dayValue, evaluateCheckIn, evaluateCheckOut, type ShiftRules } from "@/lib/attendance-rules";
import { logAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { attendanceCode, attendanceStatus, labelOf, type Tone } from "@/lib/labels";
import { eachDay, minutesOfDay, monthBounds, todayIso, weekdayIndex, zonedMidnight } from "@/lib/time";

// Admin-side attendance: the daily register, manual edits, regularisation
// approvals and the monthly muster roll / payroll summary.

type Shift = typeof shifts.$inferSelect;
type AttendanceRow = typeof attendance.$inferSelect;

const FLAG_KEYS = ["weakGps", "outsideOffice", "newDevice"] as const;

/** A check-in that needs review (weak GPS, outside office, new device). */
export function isFlagged(flags: AttendanceFlags | null | undefined): boolean {
  return Boolean(flags && FLAG_KEYS.some((k) => flags[k]));
}

function shiftRules(shift: Shift | null | undefined): ShiftRules {
  if (!shift) return DEFAULT_SHIFT;
  return {
    startTime: shift.startTime,
    endTime: shift.endTime,
    crossesMidnight: shift.crossesMidnight,
    breakMinutes: shift.breakMinutes,
    graceMinutes: shift.graceMinutes,
    halfDayAfter: shift.halfDayAfter,
    halfDayBelowMinutes: shift.halfDayBelowMinutes,
    absentBelowMinutes: shift.absentBelowMinutes,
    overtimeAfterMinutes: shift.overtimeAfterMinutes,
  };
}

/** Local "HH:MM" of an instant, for <input type="time">. */
export function toTimeInput(date: Date | null | undefined, tz: string): string {
  if (!date) return "";
  const m = minutesOfDay(date, tz);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** "HH:MM" on a local calendar day → UTC instant. */
function atLocalTime(day: string, hhmm: string, tz: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(zonedMidnight(day, tz).getTime() + (h * 60 + m) * 60_000);
}

// ── Daily register ───────────────────────────────────────────

export type DailyFilters = { departmentId?: number; q?: string };

/**
 * Every non-inactive employee with that day's attendance row (if any).
 * `off` says why a missing row is expected: the employee's weekly off or a
 * company holiday (so they aren't shown as "not checked in").
 */
export async function getDailyRegister(date: string, filters: DailyFilters) {
  const [staff, rows, holiday] = await Promise.all([
    db.query.employees.findMany({
      where: and(
        ne(employees.status, "inactive"),
        filters.departmentId ? eq(employees.departmentId, filters.departmentId) : undefined,
      ),
      columns: { id: true, name: true, empCode: true, designation: true, mobile: true },
      with: { department: { columns: { name: true } }, shift: { columns: { weeklyOffs: true } } },
      orderBy: asc(employees.name),
    }),
    db.query.attendance.findMany({
      where: eq(attendance.date, date),
      with: { checkInLocation: { columns: { name: true } } },
    }),
    db.query.holidays.findFirst({
      where: and(eq(holidays.date, date), eq(holidays.isOptional, false)),
      columns: { name: true },
    }),
  ]);
  const weekday = weekdayIndex(date);
  const byEmployee = new Map(rows.map((r) => [r.employeeId, r]));
  const q = filters.q?.trim().toLowerCase();
  return staff
    .filter((e) => !q || e.name.toLowerCase().includes(q) || e.empCode.toLowerCase().includes(q))
    .map((e) => {
      const row = byEmployee.get(e.id) ?? null;
      const off: "holiday" | "week_off" | null = row
        ? null
        : holiday
          ? "holiday"
          : (e.shift?.weeklyOffs ?? [0]).includes(weekday)
            ? "week_off"
            : null;
      return { employee: e, row, off };
    });
}

export type DailyEntry = Awaited<ReturnType<typeof getDailyRegister>>[number];

export function summarise(entries: DailyEntry[]) {
  const c = { present: 0, late: 0, halfDay: 0, onLeave: 0, absent: 0, notCheckedIn: 0, off: 0, flagged: 0 };
  for (const { row, off } of entries) {
    if (!row && off) c.off++;
    else if (!row) c.notCheckedIn++;
    else if (row.status === "present") c.present++;
    else if (row.status === "late") c.late++;
    else if (row.status === "half_day") c.halfDay++;
    else if (row.status === "on_leave") c.onLeave++;
    else if (row.status === "absent") c.absent++;
    if (row && isFlagged(row.flags)) c.flagged++;
  }
  return c;
}

// ── Recalculation ────────────────────────────────────────────

type Computed = {
  status: AttendanceStatus;
  workedMinutes: number;
  lateMinutes: number;
  overtimeMinutes: number;
};

/**
 * Status, worked, late and overtime minutes from check-in/out instants and
 * the shift rules. `fallback` is used when there is nothing to judge.
 */
function compute(
  checkInAt: Date | null,
  checkOutAt: Date | null,
  rules: ShiftRules,
  opts: { tz: string; pastDay: boolean; fallback?: AttendanceStatus },
): Computed | null {
  if (checkInAt) {
    const inMin = minutesOfDay(checkInAt, opts.tz);
    const first = evaluateCheckIn(inMin, rules);
    if (checkOutAt) {
      const out = evaluateCheckOut(
        { checkInMin: inMin, checkOutMin: minutesOfDay(checkOutAt, opts.tz), checkInStatus: first.status },
        rules,
      );
      return { ...out, lateMinutes: first.lateMinutes };
    }
    return {
      status: opts.pastDay ? "missed_punch" : first.status,
      workedMinutes: 0,
      lateMinutes: first.lateMinutes,
      overtimeMinutes: 0,
    };
  }
  return opts.fallback
    ? { status: opts.fallback, workedMinutes: 0, lateMinutes: 0, overtimeMinutes: 0 }
    : null;
}

async function loadShift(shiftId: number | null | undefined): Promise<Shift | null> {
  if (!shiftId) return null;
  return (await db.query.shifts.findFirst({ where: eq(shifts.id, shiftId) })) ?? null;
}

function snapshot(row: AttendanceRow | null | undefined): Record<string, unknown> | null {
  if (!row) return null;
  return {
    status: row.status,
    checkInAt: row.checkInAt,
    checkOutAt: row.checkOutAt,
    workedMinutes: row.workedMinutes,
    lateMinutes: row.lateMinutes,
    overtimeMinutes: row.overtimeMinutes,
    note: row.note,
  };
}

async function findDay(employeeId: number, date: string) {
  return (
    (await db.query.attendance.findFirst({
      where: and(eq(attendance.employeeId, employeeId), eq(attendance.date, date)),
    })) ?? null
  );
}

type DayValues = Computed & {
  checkInAt: Date | null;
  checkOutAt: Date | null;
  shiftId: number | null;
  note: string | null;
  flags: AttendanceFlags;
  updatedBy: number;
};

/** Insert or update the (employee, date) row and return its id. */
async function upsertDay(employeeId: number, date: string, existing: AttendanceRow | null, values: DayValues) {
  if (existing) {
    await db.update(attendance).set(values).where(eq(attendance.id, existing.id));
    return existing.id;
  }
  await db
    .insert(attendance)
    .values({ employeeId, date, ...values })
    .onDuplicateKeyUpdate({ set: values });
  const row = await findDay(employeeId, date);
  if (!row) throw new Error("Could not save the attendance day.");
  return row.id;
}

// ── Manual edit ──────────────────────────────────────────────

export type AttendanceEdit = {
  employeeId: number;
  date: string;
  /** Undefined = work it out from the times. */
  status?: AttendanceStatus;
  checkIn?: string; // "HH:MM" local
  checkOut?: string;
  note?: string;
  reason: string;
};

export async function editAttendance(input: AttendanceEdit, actorId: number) {
  const tz = env.timezone;
  const emp = await db.query.employees.findFirst({
    where: eq(employees.id, input.employeeId),
    columns: { id: true, shiftId: true },
  });
  if (!emp) throw new Error("Employee not found.");
  if (input.checkOut && !input.checkIn && !input.status) {
    throw new Error("Enter a check-in time, or pick a status.");
  }

  const existing = await findDay(input.employeeId, input.date);
  const shiftId = existing?.shiftId ?? emp.shiftId ?? null;
  const rules = shiftRules(await loadShift(shiftId));

  const checkInAt = input.checkIn ? atLocalTime(input.date, input.checkIn, tz) : null;
  let checkOutAt = input.checkOut ? atLocalTime(input.date, input.checkOut, tz) : null;
  // A check-out earlier than the check-in belongs to the next morning.
  if (checkInAt && checkOutAt && checkOutAt <= checkInAt) {
    checkOutAt = new Date(checkOutAt.getTime() + 86_400_000);
  }

  const computed = compute(checkInAt, checkOutAt, rules, {
    tz,
    pastDay: input.date < todayIso(tz),
    fallback: input.status ?? existing?.status,
  });
  if (!computed) throw new Error("Pick a status or enter the check-in time.");
  const values: DayValues = {
    ...computed,
    status: input.status ?? computed.status,
    checkInAt,
    checkOutAt,
    shiftId,
    note: input.note ?? null,
    flags: { ...(existing?.flags ?? {}), manualEdit: true },
    updatedBy: actorId,
  };

  const id = await upsertDay(input.employeeId, input.date, existing, values);
  await logAudit({
    actorId,
    tableName: "attendance",
    recordId: id,
    action: existing ? "update" : "create",
    before: snapshot(existing),
    after: {
      status: values.status,
      checkInAt,
      checkOutAt,
      workedMinutes: values.workedMinutes,
      lateMinutes: values.lateMinutes,
      overtimeMinutes: values.overtimeMinutes,
      note: values.note,
    },
    reason: input.reason,
  });
  return { status: values.status };
}

// ── Regularisations ──────────────────────────────────────────

export async function listRegularisations() {
  const [pending, recent] = await Promise.all([
    db.query.regularisations.findMany({
      where: eq(regularisations.status, "pending"),
      orderBy: [asc(regularisations.date), asc(regularisations.createdAt)],
      with: {
        employee: { columns: { name: true, empCode: true } },
      },
    }),
    db.query.regularisations.findMany({
      where: ne(regularisations.status, "pending"),
      orderBy: desc(regularisations.updatedAt),
      limit: 50,
      with: {
        employee: { columns: { name: true, empCode: true } },
        decidedByEmployee: { columns: { name: true } },
      },
    }),
  ]);
  return { pending, recent };
}

export async function approveRegularisation(id: number, actorId: number) {
  const tz = env.timezone;
  const reg = await db.query.regularisations.findFirst({ where: eq(regularisations.id, id) });
  if (!reg) throw new Error("Request not found.");
  if (reg.status !== "pending") throw new Error(`This request is already ${reg.status}.`);
  const emp = await db.query.employees.findFirst({
    where: eq(employees.id, reg.employeeId),
    columns: { shiftId: true },
  });

  const existing = await findDay(reg.employeeId, reg.date);
  const shiftId = existing?.shiftId ?? emp?.shiftId ?? null;
  const rules = shiftRules(await loadShift(shiftId));

  const checkInAt = reg.requestedCheckInAt ?? existing?.checkInAt ?? null;
  const checkOutAt = reg.requestedCheckOutAt ?? existing?.checkOutAt ?? null;
  const computed = compute(checkInAt, checkOutAt, rules, {
    tz,
    pastDay: reg.date < todayIso(tz),
    fallback: "present",
  })!;
  // On duty (client meeting, training) and "wrong status" with no times both
  // mean the employee was working that day.
  const status: AttendanceStatus =
    reg.type === "on_duty" || (!checkInAt && reg.type === "wrong_status") ? "present" : computed.status;

  const values: DayValues = {
    ...computed,
    status,
    lateMinutes: status === "present" ? 0 : computed.lateMinutes,
    checkInAt,
    checkOutAt,
    shiftId,
    note: existing?.note ?? `Regularised: ${reg.type.replace(/_/g, " ")}`,
    flags: { ...(existing?.flags ?? {}), manualEdit: true },
    updatedBy: actorId,
  };

  const attendanceId = await upsertDay(reg.employeeId, reg.date, existing, values);
  await db
    .update(regularisations)
    .set({ status: "approved", decidedBy: actorId, decidedAt: new Date(), decisionRemark: null, attendanceId })
    .where(and(eq(regularisations.id, id), eq(regularisations.status, "pending")));

  await Promise.all([
    logAudit({
      actorId,
      tableName: "attendance",
      recordId: attendanceId,
      action: existing ? "update" : "create",
      before: snapshot(existing),
      after: { status, checkInAt, checkOutAt, workedMinutes: values.workedMinutes, overtimeMinutes: values.overtimeMinutes },
      reason: `Regularisation #${id} approved`,
    }),
    logAudit({
      actorId,
      tableName: "regularisations",
      recordId: id,
      action: "update",
      before: { status: "pending" },
      after: { status: "approved" },
    }),
  ]);
  return { status };
}

export async function rejectRegularisation(id: number, actorId: number, remark: string) {
  const reg = await db.query.regularisations.findFirst({ where: eq(regularisations.id, id) });
  if (!reg) throw new Error("Request not found.");
  if (reg.status !== "pending") throw new Error(`This request is already ${reg.status}.`);
  await db
    .update(regularisations)
    .set({ status: "rejected", decidedBy: actorId, decidedAt: new Date(), decisionRemark: remark })
    .where(eq(regularisations.id, id));
  await logAudit({
    actorId,
    tableName: "regularisations",
    recordId: id,
    action: "update",
    before: { status: "pending" },
    after: { status: "rejected" },
    reason: remark,
  });
}

// ── Monthly muster roll ──────────────────────────────────────

export type MusterCell = {
  date: string;
  /** Letter code (P, L, H…), "–" for an unmarked past working day, "" otherwise. */
  code: string;
  tone: Tone | null;
  /** Weekly off or holiday (shaded in the grid). */
  off: boolean;
  title: string;
};

type MusterRow = {
  id: number;
  empCode: string;
  name: string;
  department: string | null;
  cells: MusterCell[];
  totals: {
    paidDays: number;
    lopDays: number;
    absentDays: number;
    lates: number;
    lateCut: number;
    overtimeHours: number;
  };
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function getMuster(month: string, departmentId?: number) {
  const tz = env.timezone;
  const { from, to } = monthBounds(month);
  const today = todayIso(tz);
  const days = eachDay(from, to);

  const [staff, rows, holidayRows, deptRows] = await Promise.all([
    db.query.employees.findMany({
      where: and(
        departmentId ? eq(employees.departmentId, departmentId) : undefined,
        or(ne(employees.status, "inactive"), gte(employees.leftOn, from)),
        or(sql`${employees.joinedOn} is null`, lte(employees.joinedOn, to)),
      ),
      columns: { id: true, name: true, empCode: true, joinedOn: true, leftOn: true, departmentId: true },
      with: { shift: { columns: { weeklyOffs: true, latesPerHalfDay: true } } },
      orderBy: asc(employees.name),
    }),
    db
      .select({
        employeeId: attendance.employeeId,
        date: attendance.date,
        status: attendance.status,
        overtimeMinutes: attendance.overtimeMinutes,
        leaveRequestId: attendance.leaveRequestId,
      })
      .from(attendance)
      .where(and(gte(attendance.date, from), lte(attendance.date, to))),
    db
      .select({ date: holidays.date, name: holidays.name })
      .from(holidays)
      .where(and(gte(holidays.date, from), lte(holidays.date, to), eq(holidays.isOptional, false))),
    db.select({ id: departments.id, name: departments.name }).from(departments),
  ]);

  // Leave without pay counts as loss of pay even though the status is on_leave.
  const leaveIds = [...new Set(rows.map((r) => r.leaveRequestId).filter((x): x is number => x != null))];
  const unpaidLeave = new Set<number>();
  if (leaveIds.length) {
    const lr = await db
      .select({ id: leaveRequests.id, isPaid: leaveTypes.isPaid })
      .from(leaveRequests)
      .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
      .where(inArray(leaveRequests.id, leaveIds));
    for (const r of lr) if (!r.isPaid) unpaidLeave.add(r.id);
  }

  const holidayByDate = new Map(holidayRows.map((h) => [h.date, h.name]));
  const deptName = new Map(deptRows.map((d) => [d.id, d.name]));
  const byKey = new Map(rows.map((r) => [`${r.employeeId}:${r.date}`, r]));

  const musterRows: MusterRow[] = staff.map((e) => {
    const offs = new Set(e.shift?.weeklyOffs ?? [0]);
    const latesPerHalfDay = e.shift?.latesPerHalfDay ?? 3;
    let paid = 0;
    let lop = 0;
    let absent = 0;
    let lates = 0;
    let otMinutes = 0;

    const cells = days.map((date): MusterCell => {
      const holiday = holidayByDate.get(date);
      const weeklyOff = offs.has(weekdayIndex(date));
      const off = Boolean(holiday) || weeklyOff;
      const employed = (!e.joinedOn || date >= e.joinedOn) && (!e.leftOn || date <= e.leftOn);
      if (!employed) return { date, code: "", tone: null, off: false, title: "Not employed" };

      const row = byKey.get(`${e.id}:${date}`);
      if (row) {
        const unpaid = row.status === "on_leave" && row.leaveRequestId != null && unpaidLeave.has(row.leaveRequestId);
        const value = unpaid ? 0 : dayValue[row.status];
        paid += value;
        lop += 1 - value;
        if (row.status === "absent" || row.status === "missed_punch") absent++;
        if (row.status === "late") lates++;
        otMinutes += row.overtimeMinutes;
        const label = labelOf(attendanceStatus, row.status);
        return {
          date,
          code: attendanceCode[row.status] ?? "?",
          tone: label.tone,
          off,
          title: unpaid ? `${label.label} (unpaid)` : label.label,
        };
      }
      if (date > today) return { date, code: "", tone: null, off, title: holiday ?? (weeklyOff ? "Week off" : "") };
      if (off) {
        paid += 1;
        return {
          date,
          code: holiday ? attendanceCode.holiday : attendanceCode.week_off,
          tone: "neutral",
          off,
          title: holiday ?? "Week off",
        };
      }
      if (date === today) return { date, code: "", tone: null, off, title: "Not checked in yet" };
      // Past working day with no record: unpaid until corrected.
      lop += 1;
      absent++;
      return { date, code: "–", tone: "danger", off, title: "No record (counted as absent)" };
    });

    const lateCut = latesPerHalfDay > 0 ? Math.floor(lates / latesPerHalfDay) * 0.5 : 0;
    return {
      id: e.id,
      empCode: e.empCode,
      name: e.name,
      department: e.departmentId ? (deptName.get(e.departmentId) ?? null) : null,
      cells,
      totals: {
        paidDays: round2(Math.max(0, paid - lateCut)),
        lopDays: round2(lop + Math.min(lateCut, paid)),
        absentDays: absent,
        lates,
        lateCut,
        overtimeHours: Math.round((otMinutes / 60) * 10) / 10,
      },
    };
  });

  return {
    month,
    from,
    to,
    days: days.map((date) => ({ date, holiday: holidayByDate.get(date) ?? null })),
    rows: musterRows,
  };
}
