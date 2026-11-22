import { and, desc, eq, gte, lte } from "drizzle-orm";
import {
  CalendarCheckIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  MapPinIcon,
  PartyPopperIcon,
  WrenchIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { SectionTitle } from "@/components/app/page-header";
import { badgeFrom, StatusBadge } from "@/components/app/status-badge";
import { TagLocation } from "@/components/staff/tag-location";
import { WorkedTicker } from "@/components/staff/worked-ticker";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/db";
import { attendance, fieldVisits, holidays, leaveRequests } from "@/db/schema";
import { brand } from "@/lib/brand";
import { env } from "@/lib/env";
import { attendanceStatus, labelOf, visitPurpose, visitStatus } from "@/lib/labels";
import { requireViewer } from "@/lib/session";
import {
  addDays,
  eachDay,
  formatDate,
  formatTime,
  minutesOfDay,
  minutesToLabel,
  timeToMinutes,
  weekdayIndex,
  weekdayShort,
  zonedMidnight,
} from "@/lib/time";
import { cn } from "@/lib/utils";
import { getBalances } from "@/server/leave";
import { getAssignedJobs, getTodayContext, resolveDayStatus } from "@/server/staff";

import { PunchFlow } from "./punch-flow";

export const metadata: Metadata = { title: "Home" };

function greeting(tz: string) {
  const m = minutesOfDay(new Date(), tz);
  if (m < 12 * 60) return "Good morning";
  if (m < 17 * 60) return "Good afternoon";
  return "Good evening";
}

const serverNow = () => Date.now();

const shiftLabel = (start: string, end: string) =>
  `${minutesToLabel(timeToMinutes(start))} – ${minutesToLabel(timeToMinutes(end))}`;

export default async function StaffHomePage() {
  const viewer = await requireViewer();
  const me = viewer.employee;
  const tz = env.timezone;
  const ctx = await getTodayContext(me.id);
  const { today, row, shift } = ctx;
  const isTechnician = me.role === "technician";
  const isField = me.workType !== "office";

  const [balances, pendingLeave, recentRows, recentHolidays, jobs, visitsToday] = await Promise.all([
    getBalances(me.id, Number(today.slice(0, 4))),
    db.$count(leaveRequests, and(eq(leaveRequests.employeeId, me.id), eq(leaveRequests.status, "pending"))),
    db
      .select()
      .from(attendance)
      .where(and(eq(attendance.employeeId, me.id), gte(attendance.date, addDays(today, -5)), lte(attendance.date, addDays(today, -1)))),
    db
      .select({ date: holidays.date })
      .from(holidays)
      .where(and(gte(holidays.date, addDays(today, -5)), lte(holidays.date, addDays(today, -1)), eq(holidays.isOptional, false))),
    isTechnician ? getAssignedJobs(me.id, today) : Promise.resolve([]),
    isField && !isTechnician
      ? db.query.fieldVisits.findMany({
          where: and(eq(fieldVisits.employeeId, me.id), gte(fieldVisits.loggedAt, zonedMidnight(today, tz))),
          orderBy: [desc(fieldVisits.loggedAt)],
          with: { client: { columns: { name: true } } },
        })
      : Promise.resolve([]),
  ]);

  const statusKey = resolveDayStatus(row, {
    isToday: true,
    isFuture: false,
    isHoliday: Boolean(ctx.holiday),
    isWeekOff: ctx.isWeekOff,
    onLeave: Boolean(ctx.leave),
  });
  const checkedIn = Boolean(row?.checkInAt);
  const checkedOut = Boolean(row?.checkOutAt);

  const dayNote = ctx.holiday
    ? `Today is a holiday (${ctx.holiday.name}).`
    : ctx.leave
      ? `You're on approved ${ctx.leave.leaveType.name}${ctx.leave.halfDay ? " (half-day)" : ""} today.`
      : ctx.isWeekOff
        ? "Today is your weekly off."
        : null;

  const byDate = new Map(recentRows.map((r) => [r.date, r]));
  const holidayDates = new Set(recentHolidays.map((h) => h.date));
  const recentDays = eachDay(addDays(today, -5), addDays(today, -1)).reverse();
  const paidBalances = balances.filter((b) => b.isPaid).slice(0, 3);
  const firstName = me.name.split(" ")[0];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-sm text-muted-foreground">
          {weekdayShort(today)}, {formatDate(today)}
        </p>
        <h1 className="text-xl font-bold tracking-tight">
          {greeting(tz)}, {firstName}
        </h1>
      </div>

      {/* Today */}
      <Card className="gap-3">
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium">{shift.name}</p>
              <p className="text-xs text-muted-foreground">{shiftLabel(shift.startTime, shift.endTime)}</p>
            </div>
            {statusKey ? badgeFrom(labelOf(attendanceStatus, statusKey)) : null}
          </div>

          <dl className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-muted/60 p-2">
              <dt className="text-[11px] text-muted-foreground">Check in</dt>
              <dd className="text-sm font-semibold tabular-nums">{formatTime(row?.checkInAt, tz)}</dd>
            </div>
            <div className="rounded-lg bg-muted/60 p-2">
              <dt className="text-[11px] text-muted-foreground">Hours today</dt>
              <dd className="text-sm font-semibold">
                {row?.checkInAt ? (
                  <WorkedTicker
                    checkInAt={row.checkInAt.toISOString()}
                    checkOutAt={row.checkOutAt?.toISOString() ?? null}
                    serverNow={serverNow()}
                  />
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div className="rounded-lg bg-muted/60 p-2">
              <dt className="text-[11px] text-muted-foreground">Check out</dt>
              <dd className="text-sm font-semibold tabular-nums">{formatTime(row?.checkOutAt, tz)}</dd>
            </div>
          </dl>

          {checkedIn && row?.checkInLocation ? (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPinIcon className="size-3.5" /> Checked in near {row.checkInLocation.name}
              {row.checkInDistanceM != null ? ` · ${row.checkInDistanceM} m away` : ""}
            </p>
          ) : null}

          {dayNote ? (
            <p className="flex items-start gap-2 rounded-lg bg-info-soft px-3 py-2 text-sm text-info">
              <PartyPopperIcon className="mt-0.5 size-4 shrink-0" />
              <span>
                {dayNote}
                {!checkedIn ? " You can still check in if you're working." : ""}
              </span>
            </p>
          ) : null}

          {!checkedIn ? (
            <PunchFlow key="in" mode="in" watermark={`${brand.company} · ${me.name}`} />
          ) : !checkedOut ? (
            <>
              {isField ? <TagLocation watermark={`${brand.company} · ${me.name}`} /> : null}
              <PunchFlow key="out" mode="out" watermark={`${brand.company} · ${me.name}`} />
            </>
          ) : (
            <div className="flex items-center gap-2 rounded-xl bg-success-soft px-3 py-3 text-sm font-medium text-success">
              <CircleCheckIcon className="size-5" /> All done for today. See you tomorrow!
            </div>
          )}
        </CardContent>
      </Card>

      {/* Leave */}
      <section className="flex flex-col gap-2">
        <SectionTitle
          action={
            <Link href="/me/leave" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Apply <ChevronRightIcon />
            </Link>
          }
        >
          Leave balance
        </SectionTitle>
        {paidBalances.length ? (
          <div className={cn("grid gap-2", ["grid-cols-1", "grid-cols-2", "grid-cols-3"][paidBalances.length - 1])}>
            {paidBalances.map((b) => (
              <Link
                key={b.leaveTypeId}
                href="/me/leave"
                className="rounded-xl border bg-card p-3 text-center shadow-xs hover:border-primary/40"
              >
                <div className={cn("text-2xl font-bold tabular-nums", b.available <= 0 && "text-destructive")}>
                  {b.available}
                </div>
                <div className="truncate text-xs text-muted-foreground" title={b.name}>
                  {b.name}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No leave balances set up yet.</p>
        )}
        {pendingLeave ? (
          <Link href="/me/leave" className="text-sm text-warning">
            {pendingLeave} leave request{pendingLeave === 1 ? "" : "s"} waiting for approval
          </Link>
        ) : null}
      </section>

      {/* Jobs (technicians) */}
      {isTechnician ? (
        <section className="flex flex-col gap-2">
          <SectionTitle
            action={
              <Link href="/me/jobs" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                All jobs <ChevronRightIcon />
              </Link>
            }
          >
            Today&apos;s jobs
          </SectionTitle>
          {jobs.length === 0 ? (
            <p className="rounded-xl border border-dashed bg-card p-4 text-center text-sm text-muted-foreground">
              No service visits due today.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {jobs.slice(0, 4).map((j) => (
                <li key={j.id}>
                  <Link
                    href="/me/jobs"
                    className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-xs hover:border-primary/40"
                  >
                    <WrenchIcon className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{j.installation.site.client.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[j.installation.site.area, j.installation.site.city].filter(Boolean).join(", ") ||
                          j.installation.site.addressLine}
                      </p>
                    </div>
                    {j.dueOn < today ? <StatusBadge label="Overdue" tone="danger" /> : <StatusBadge label="Today" tone="info" />}
                  </Link>
                </li>
              ))}
              {jobs.length > 4 ? (
                <li className="text-center text-xs text-muted-foreground">+{jobs.length - 4} more</li>
              ) : null}
            </ul>
          )}
        </section>
      ) : null}

      {/* Visits (field staff) */}
      {isField && !isTechnician ? (
        <section className="flex flex-col gap-2">
          <SectionTitle
            action={
              <Link href="/me/visits" className={buttonVariants({ variant: "outline", size: "sm" })}>
                <MapPinIcon /> Log visit
              </Link>
            }
          >
            Visits today
          </SectionTitle>
          {visitsToday.length === 0 ? (
            <p className="rounded-xl border border-dashed bg-card p-4 text-center text-sm text-muted-foreground">
              No visits logged yet today.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {visitsToday.map((v) => (
                <li key={v.id}>
                  <Link
                    href="/me/visits"
                    className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-xs hover:border-primary/40"
                  >
                    <span className="w-16 shrink-0 text-xs text-muted-foreground tabular-nums">
                      {formatTime(v.loggedAt, tz)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {v.purpose === "location_tag" ? (v.placeLabel ?? "Location tag") : (v.client?.name ?? v.prospectName ?? "Prospect")}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{visitPurpose[v.purpose] ?? v.purpose}</p>
                    </div>
                    {badgeFrom(labelOf(visitStatus, v.status))}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {/* Last 5 days */}
      <section className="flex flex-col gap-2">
        <SectionTitle
          action={
            <Link href="/me/history" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              History <ChevronRightIcon />
            </Link>
          }
        >
          Last 5 days
        </SectionTitle>
        <Card className="py-0">
          <ul className="divide-y">
            {recentDays.map((d) => {
              const r = byDate.get(d);
              const key = resolveDayStatus(r, {
                isToday: false,
                isFuture: false,
                isHoliday: holidayDates.has(d),
                isWeekOff: shift.weeklyOffs.includes(weekdayIndex(d)),
              });
              return (
                <li key={d} className="flex items-center gap-3 px-4 py-2.5">
                  <CalendarCheckIcon className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {weekdayShort(d)}, {formatDate(d)}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {r?.checkInAt ? `${formatTime(r.checkInAt, tz)} – ${formatTime(r.checkOutAt, tz)}` : "No punches"}
                    </p>
                  </div>
                  {key ? badgeFrom(labelOf(attendanceStatus, key)) : <StatusBadge label="No record" />}
                </li>
              );
            })}
          </ul>
        </Card>
      </section>
    </div>
  );
}
