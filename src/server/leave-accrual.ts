import "server-only";

import { and, eq, isNotNull, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import { employees, leaveBalanceAdjustments, leaveBalances, leavePolicyTypes } from "@/db/schema";
import { isoDateInTz } from "@/lib/time";

// Leave credits, run by the daily job (and once when an employee is added).
//
// - Yearly types: the full quota is credited once per calendar year.
// - Monthly types: 1/12 of the quota is earned each month, rounded down to
//   half days. The credit is target-based: the job works out what should have
//   been credited by this month and tops up the difference, so a missed run
//   catches up and a second run on the same day does nothing.
// - Carry forward: in a new year, what was left last year (up to the type's
//   carry-forward limit) becomes this year's opening balance, once.
//
// Every credit is written to leave_balance_adjustments, which is also what
// makes each step idempotent.

export const floorHalf = (n: number) => Math.floor(n * 2) / 2;

type Rule = typeof leavePolicyTypes.$inferSelect;

/** Days a monthly type should have earned in `year` by the end of `month` (1–12). */
export function monthlyTarget(rule: Rule, startMonth: number, month: number) {
  const months = Math.max(0, month - startMonth + 1);
  return Math.min(rule.yearlyQuota, floorHalf((rule.yearlyQuota / 12) * months));
}

/** Add days to a balance row (created if missing) and record why. */
async function credit(input: {
  employeeId: number;
  leaveTypeId: number;
  year: number;
  days: number;
  kind: "accrual" | "carry_forward";
  reason: string;
  actorId: number | null;
}) {
  const { employeeId, leaveTypeId, year, days } = input;
  const column = input.kind === "carry_forward" ? "opening" : "credited";
  await db
    .insert(leaveBalances)
    .values({ employeeId, leaveTypeId, year, [column]: days })
    .onDuplicateKeyUpdate({
      set:
        column === "opening"
          ? { opening: sql`${leaveBalances.opening} + ${days}` }
          : { credited: sql`${leaveBalances.credited} + ${days}` },
    });
  await db.insert(leaveBalanceAdjustments).values({
    employeeId,
    leaveTypeId,
    year,
    kind: input.kind,
    days,
    reason: input.reason,
    createdBy: input.actorId,
  });
}

/** Sum of ledger entries of one kind, per leave type, for one employee and year. */
async function ledgerTotals(employeeId: number, year: number, kind: "accrual" | "carry_forward") {
  const rows = await db
    .select({ leaveTypeId: leaveBalanceAdjustments.leaveTypeId, days: sql<string>`SUM(${leaveBalanceAdjustments.days})` })
    .from(leaveBalanceAdjustments)
    .where(
      and(
        eq(leaveBalanceAdjustments.employeeId, employeeId),
        eq(leaveBalanceAdjustments.year, year),
        eq(leaveBalanceAdjustments.kind, kind),
      ),
    )
    .groupBy(leaveBalanceAdjustments.leaveTypeId);
  return new Map(rows.map((r) => [r.leaveTypeId, Number(r.days)]));
}

/**
 * The first month an employee earns leave in `year`: the later of the month
 * they joined and the month they were added to the system (1 if both are
 * before this year).
 */
export function startMonthFor(year: number, joinedOn: string | null, addedOn: string) {
  const monthIn = (iso: string | null) =>
    iso && Number(iso.slice(0, 4)) === year ? Number(iso.slice(5, 7)) : iso && Number(iso.slice(0, 4)) > year ? 13 : 1;
  return Math.max(monthIn(joinedOn), monthIn(addedOn));
}

/** Bring one employee's credits for the current year up to date. */
export async function accrueForEmployee(
  emp: { id: number; leavePolicyId: number; joinedOn: string | null; addedOn: string },
  today: string,
  actorId: number | null,
) {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const rules = await db.select().from(leavePolicyTypes).where(eq(leavePolicyTypes.policyId, emp.leavePolicyId));
  if (!rules.length) return { credited: 0, carried: 0 };

  const startMonth = startMonthFor(year, emp.joinedOn, emp.addedOn);
  if (startMonth > month) return { credited: 0, carried: 0 }; // not joined yet

  const accrued = await ledgerTotals(emp.id, year, "accrual");
  const thisYear = await db
    .select({ leaveTypeId: leaveBalances.leaveTypeId, credited: leaveBalances.credited })
    .from(leaveBalances)
    .where(and(eq(leaveBalances.employeeId, emp.id), eq(leaveBalances.year, year)));
  let credited = 0;
  for (const rule of rules) {
    // Credits already given: the ledger, or the balance row if it was filled
    // without ledger entries (imports, older data). Never credit twice.
    const balanceCredited = thisYear.find((b) => b.leaveTypeId === rule.leaveTypeId)?.credited ?? 0;
    const have = Math.max(accrued.get(rule.leaveTypeId) ?? 0, balanceCredited);
    let target = 0;
    let reason = "";
    if (rule.accrual === "yearly") {
      // Yearly credit happens once; any earlier credit this year counts.
      target = accrued.has(rule.leaveTypeId) || balanceCredited > 0 ? have : rule.yearlyQuota;
      reason = `Yearly credit for ${year}`;
    } else if (rule.accrual === "monthly") {
      target = monthlyTarget(rule, startMonth, month);
      reason = `Monthly accrual up to ${today.slice(0, 7)}`;
    }
    const diff = floorHalf(target - have);
    if (diff > 0) {
      await credit({ employeeId: emp.id, leaveTypeId: rule.leaveTypeId, year, days: diff, kind: "accrual", reason, actorId });
      credited++;
    }
  }

  // Carry forward last year's balance, once per type.
  let carried = 0;
  const carriedAlready = await ledgerTotals(emp.id, year, "carry_forward");
  const lastYear = await db
    .select()
    .from(leaveBalances)
    .where(and(eq(leaveBalances.employeeId, emp.id), eq(leaveBalances.year, year - 1)));
  for (const rule of rules) {
    if (rule.carryForwardMax <= 0 || carriedAlready.has(rule.leaveTypeId)) continue;
    const b = lastYear.find((r) => r.leaveTypeId === rule.leaveTypeId);
    if (!b) continue;
    const left = b.opening + b.credited + b.adjusted - b.used;
    const days = floorHalf(Math.min(Math.max(left, 0), rule.carryForwardMax));
    if (days <= 0) continue;
    await credit({
      employeeId: emp.id,
      leaveTypeId: rule.leaveTypeId,
      year,
      days,
      kind: "carry_forward",
      reason: `Carried forward from ${year - 1} (max ${rule.carryForwardMax})`,
      actorId,
    });
    carried++;
  }
  return { credited, carried };
}

/** Daily job step: credits and carry forward for every current employee with a policy. */
export async function runLeaveAccruals(today: string, tz: string) {
  const staff = await db
    .select({
      id: employees.id,
      leavePolicyId: employees.leavePolicyId,
      joinedOn: employees.joinedOn,
      createdAt: employees.createdAt,
    })
    .from(employees)
    .where(and(ne(employees.status, "inactive"), isNotNull(employees.leavePolicyId)));

  const summary = { employees: staff.length, credits: 0, carryForwards: 0 };
  for (const e of staff) {
    const res = await accrueForEmployee(
      { id: e.id, leavePolicyId: e.leavePolicyId!, joinedOn: e.joinedOn, addedOn: isoDateInTz(e.createdAt, tz) },
      today,
      null,
    );
    summary.credits += res.credited;
    summary.carryForwards += res.carried;
  }
  return summary;
}
