import { and, desc, eq, gte, lte } from "drizzle-orm";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader, SectionTitle } from "@/components/app/page-header";
import { badgeFrom, StatusBadge } from "@/components/app/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { db } from "@/db";
import { attendance, holidays, regularisations } from "@/db/schema";
import { env } from "@/lib/env";
import { attendanceStatus, labelOf, requestStatus } from "@/lib/labels";
import { requireViewer } from "@/lib/session";
import {
  eachDay,
  formatDate,
  formatDuration,
  formatMonth,
  formatTime,
  minutesOfDay,
  monthBounds,
  todayIso,
  weekdayIndex,
  weekdayShort,
} from "@/lib/time";
import { cn } from "@/lib/utils";
import { getShiftInfo, resolveDayStatus } from "@/server/staff";

import { CorrectionDialog } from "./correction-dialog";

export const metadata: Metadata = { title: "History" };

const regLabels: Record<string, string> = {
  missed_check_in: "Missed check-in",
  missed_check_out: "Missed check-out",
  wrong_status: "Wrong status",
  on_duty: "On duty",
};

function shiftMonth(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

function hhmm(date: Date | null | undefined, tz: string) {
  if (!date) return undefined;
  const m = minutesOfDay(date, tz);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

type SearchParams = Promise<{ month?: string }>;

export default async function MyHistoryPage({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requireViewer();
  const me = viewer.employee;
  const tz = env.timezone;
  const today = todayIso(tz);
  const thisMonth = today.slice(0, 7);
  const sp = await searchParams;
  const month =
    sp.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) && sp.month <= thisMonth ? sp.month : thisMonth;
  const { from, to } = monthBounds(month);
  const lastDay = to < today ? to : today;

  const [shift, rows, hols, requests] = await Promise.all([
    getShiftInfo(me.id),
    db
      .select()
      .from(attendance)
      .where(and(eq(attendance.employeeId, me.id), gte(attendance.date, from), lte(attendance.date, to))),
    db
      .select({ date: holidays.date, name: holidays.name })
      .from(holidays)
      .where(and(gte(holidays.date, from), lte(holidays.date, to), eq(holidays.isOptional, false))),
    db.query.regularisations.findMany({
      where: and(eq(regularisations.employeeId, me.id), gte(regularisations.date, from), lte(regularisations.date, to)),
      orderBy: [desc(regularisations.createdAt)],
    }),
  ]);

  const byDate = new Map(rows.map((r) => [r.date, r]));
  const holidayByDate = new Map(hols.map((h) => [h.date, h.name]));
  const days = from <= lastDay ? eachDay(from, lastDay).reverse() : [];

  const totals = { present: 0, late: 0, halfDay: 0, absent: 0, leave: 0, worked: 0 };
  for (const r of rows) {
    if (r.status === "present" || r.status === "late") totals.present += 1;
    if (r.status === "late") totals.late += 1;
    if (r.status === "half_day") totals.halfDay += 1;
    if (r.status === "absent") totals.absent += 1;
    if (r.status === "on_leave") totals.leave += 1;
    totals.worked += r.workedMinutes;
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="History" description="Your attendance, day by day." />

      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/me/history?month=${shiftMonth(month, -1)}`}
          className={buttonVariants({ variant: "outline", size: "icon-lg" })}
          aria-label="Previous month"
        >
          <ChevronLeftIcon />
        </Link>
        <span className="text-base font-semibold">{formatMonth(month)}</span>
        {month < thisMonth ? (
          <Link
            href={`/me/history?month=${shiftMonth(month, 1)}`}
            className={buttonVariants({ variant: "outline", size: "icon-lg" })}
            aria-label="Next month"
          >
            <ChevronRightIcon />
          </Link>
        ) : (
          <span className="size-9" aria-hidden />
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Present", value: totals.present, tone: "text-success" },
          { label: "Late", value: totals.late, tone: "text-warning" },
          { label: "Half-day", value: totals.halfDay, tone: "text-warning" },
          { label: "Absent", value: totals.absent, tone: "text-destructive" },
          { label: "On leave", value: totals.leave, tone: "text-primary" },
          { label: "Worked", value: formatDuration(totals.worked), tone: "text-foreground" },
        ].map((t) => (
          <div key={t.label} className="rounded-xl border bg-card p-3 text-center shadow-xs">
            <div className={cn("text-lg font-bold tabular-nums", t.tone)}>{t.value}</div>
            <div className="text-xs text-muted-foreground">{t.label}</div>
          </div>
        ))}
      </div>

      <Card className="py-0">
        {days.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">Nothing to show for this month yet.</p>
        ) : (
          <ul className="divide-y">
            {days.map((d) => {
              const r = byDate.get(d);
              const holiday = holidayByDate.get(d);
              const isToday = d === today;
              const key = resolveDayStatus(r, {
                isToday,
                isFuture: false,
                isHoliday: Boolean(holiday),
                isWeekOff: shift.weeklyOffs.includes(weekdayIndex(d)),
              });
              const defaultType = !r?.checkInAt
                ? "missed_check_in"
                : !r.checkOutAt && !isToday
                  ? "missed_check_out"
                  : "wrong_status";
              return (
                <li key={d} className="flex flex-col gap-1 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">
                      {weekdayShort(d)}, {formatDate(d)}
                      {holiday ? <span className="font-normal text-muted-foreground"> · {holiday}</span> : null}
                    </p>
                    {key ? badgeFrom(labelOf(attendanceStatus, key)) : <StatusBadge label="No record" />}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {r?.checkInAt ? (
                        <>
                          In {formatTime(r.checkInAt, tz)} · Out {formatTime(r.checkOutAt, tz)}
                          {r.workedMinutes ? ` · ${formatDuration(r.workedMinutes)}` : ""}
                          {r.lateMinutes ? ` · ${formatDuration(r.lateMinutes)} late` : ""}
                        </>
                      ) : (
                        "No punches"
                      )}
                    </p>
                    <CorrectionDialog
                      date={d}
                      dateLabel={`${weekdayShort(d)}, ${formatDate(d)}`}
                      defaultType={defaultType}
                      checkIn={hhmm(r?.checkInAt, tz)}
                      checkOut={hhmm(r?.checkOutAt, tz)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <section className="flex flex-col gap-2">
        <SectionTitle>Correction requests</SectionTitle>
        {requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">No correction requests this month.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {requests.map((q) => (
              <li key={q.id} className="rounded-xl border bg-card p-3 shadow-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {regLabels[q.type] ?? q.type} · {weekdayShort(q.date)}, {formatDate(q.date)}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {q.requestedCheckInAt ? `In ${formatTime(q.requestedCheckInAt, tz)}` : ""}
                      {q.requestedCheckInAt && q.requestedCheckOutAt ? " · " : ""}
                      {q.requestedCheckOutAt ? `Out ${formatTime(q.requestedCheckOutAt, tz)}` : ""}
                    </p>
                  </div>
                  {badgeFrom(labelOf(requestStatus, q.status))}
                </div>
                <p className="mt-1 text-sm text-foreground/90">{q.reason}</p>
                {q.decisionRemark ? (
                  <p className="mt-2 rounded-lg bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">
                    Remark: {q.decisionRemark}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
