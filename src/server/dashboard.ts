import "server-only";

import { and, asc, count, desc, eq, gte, lte, ne, notInArray, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  amcContracts,
  attendance,
  complaints,
  departments,
  employees,
  fieldVisits,
  holidays,
  leaveRequests,
  regularisations,
  serviceVisits,
  shifts,
  smsMessages,
} from "@/db/schema";
import { addDays, todayIso, weekdayIndex, zonedMidnight } from "@/lib/time";

export async function getDashboard(tz: string) {
  const today = todayIso(tz);
  const in7 = addDays(today, 7);
  const in30 = addDays(today, 30);
  const from14 = addDays(today, -13);
  const startOfToday = zonedMidnight(today, tz);

  const [
    staff,
    deptRows,
    todayRows,
    trendRows,
    [pendingLeave],
    [pendingCorrections],
    [pendingVisits],
    [visitsToday],
    [serviceDue],
    [serviceOverdue],
    [amcExpiring],
    [openComplaints],
    [smsToday],
    [smsFailed],
    recentVisits,
    upcomingService,
  ] = await Promise.all([
    db
      .select({ id: employees.id, departmentId: employees.departmentId, weeklyOffs: shifts.weeklyOffs })
      .from(employees)
      .leftJoin(shifts, eq(shifts.id, employees.shiftId))
      .where(ne(employees.status, "inactive")),
    db.select({ id: departments.id, name: departments.name }).from(departments),
    db
      .select({ employeeId: attendance.employeeId, status: attendance.status, flags: attendance.flags })
      .from(attendance)
      .where(eq(attendance.date, today)),
    db
      .select({ date: attendance.date, status: attendance.status, n: count() })
      .from(attendance)
      .where(and(gte(attendance.date, from14), lte(attendance.date, today)))
      .groupBy(attendance.date, attendance.status),
    db.select({ n: count() }).from(leaveRequests).where(eq(leaveRequests.status, "pending")),
    db.select({ n: count() }).from(regularisations).where(eq(regularisations.status, "pending")),
    db.select({ n: count() }).from(fieldVisits).where(eq(fieldVisits.status, "pending")),
    db.select({ n: count() }).from(fieldVisits).where(gte(fieldVisits.loggedAt, startOfToday)),
    db
      .select({ n: count() })
      .from(serviceVisits)
      .where(and(eq(serviceVisits.status, "scheduled"), gte(serviceVisits.dueOn, today), lte(serviceVisits.dueOn, in7))),
    db
      .select({ n: count() })
      .from(serviceVisits)
      .where(and(eq(serviceVisits.status, "scheduled"), sql`${serviceVisits.dueOn} < ${today}`)),
    db
      .select({ n: count() })
      .from(amcContracts)
      .where(and(eq(amcContracts.status, "active"), lte(amcContracts.endOn, in30))),
    db
      .select({ n: count() })
      .from(complaints)
      .where(notInArray(complaints.status, ["resolved", "closed"])),
    db.select({ n: count() }).from(smsMessages).where(gte(smsMessages.createdAt, startOfToday)),
    db
      .select({ n: count() })
      .from(smsMessages)
      .where(and(eq(smsMessages.status, "failed"), gte(smsMessages.createdAt, new Date(Date.now() - 7 * 86_400_000)))),
    db.query.fieldVisits.findMany({
      orderBy: desc(fieldVisits.loggedAt),
      limit: 5,
      with: {
        employee: { columns: { name: true } },
        client: { columns: { name: true } },
      },
    }),
    db.query.serviceVisits.findMany({
      where: and(eq(serviceVisits.status, "scheduled"), gte(serviceVisits.dueOn, addDays(today, -30))),
      orderBy: asc(serviceVisits.dueOn),
      limit: 6,
      with: {
        technician: { columns: { name: true } },
        installation: {
          columns: { capacityLph: true },
          with: { site: { columns: { area: true, city: true }, with: { client: { columns: { id: true, name: true } } } } },
        },
      },
    }),
  ]);

  // Today's headcount. Staff without a row whose weekly off (or a company
  // holiday) is today count as "off", not as "not checked in".
  const isHoliday = Boolean(
    await db.query.holidays.findFirst({
      where: and(eq(holidays.date, today), eq(holidays.isOptional, false)),
      columns: { id: true },
    }),
  );
  const weekday = weekdayIndex(today);
  const byEmployee = new Map(todayRows.map((r) => [r.employeeId, r]));
  const counts = { present: 0, late: 0, halfDay: 0, onLeave: 0, absent: 0, off: 0, notCheckedIn: 0, flagged: 0 };
  for (const e of staff) {
    const row = byEmployee.get(e.id);
    if (!row && (isHoliday || (e.weeklyOffs ?? [0]).includes(weekday))) counts.off++;
    else if (!row) counts.notCheckedIn++;
    else if (row.status === "present") counts.present++;
    else if (row.status === "late") counts.late++;
    else if (row.status === "half_day") counts.halfDay++;
    else if (row.status === "on_leave") counts.onLeave++;
    else if (row.status === "holiday" || row.status === "week_off") counts.off++;
    else counts.absent++;
    if (row?.flags && (row.flags.weakGps || row.flags.outsideOffice || row.flags.newDevice)) counts.flagged++;
  }

  // Per department.
  const deptName = new Map(deptRows.map((d) => [d.id, d.name]));
  const deptMap = new Map<string, { name: string; total: number; present: number; late: number; leave: number; absent: number }>();
  for (const e of staff) {
    const name = (e.departmentId && deptName.get(e.departmentId)) || "Unassigned";
    const d = deptMap.get(name) ?? { name, total: 0, present: 0, late: 0, leave: 0, absent: 0 };
    d.total++;
    const s = byEmployee.get(e.id)?.status;
    if (s === "present" || s === "half_day") d.present++;
    else if (s === "late") d.late++;
    else if (s === "on_leave") d.leave++;
    else if (s === "absent" || s === "missed_punch") d.absent++;
    deptMap.set(name, d);
  }

  // 14-day trend.
  const trend: { date: string; present: number; late: number; leave: number; absent: number }[] = [];
  for (let d = from14; d <= today; d = addDays(d, 1)) {
    trend.push({ date: d, present: 0, late: 0, leave: 0, absent: 0 });
  }
  const trendIdx = new Map(trend.map((t, i) => [t.date, i]));
  for (const r of trendRows) {
    const t = trend[trendIdx.get(r.date) ?? -1];
    if (!t) continue;
    if (r.status === "present" || r.status === "half_day") t.present += r.n;
    else if (r.status === "late") t.late += r.n;
    else if (r.status === "on_leave") t.leave += r.n;
    else if (r.status === "absent" || r.status === "missed_punch") t.absent += r.n;
  }

  return {
    today,
    activeStaff: staff.length,
    counts,
    departments: [...deptMap.values()].sort((a, b) => b.total - a.total),
    trend,
    pending: {
      leave: pendingLeave.n,
      corrections: pendingCorrections.n,
      visits: pendingVisits.n,
    },
    visitsToday: visitsToday.n,
    serviceDue: serviceDue.n,
    serviceOverdue: serviceOverdue.n,
    amcExpiring: amcExpiring.n,
    openComplaints: openComplaints.n,
    smsToday: smsToday.n,
    smsFailed: smsFailed.n,
    recentVisits,
    upcomingService,
  };
}
