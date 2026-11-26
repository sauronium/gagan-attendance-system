import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon, UsersIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/app/empty-state";
import { FilterBar, FilterField } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { env } from "@/lib/env";
import { attendanceCode, attendanceStatus, type Tone } from "@/lib/labels";
import { requireAdmin } from "@/lib/session";
import { formatMonth, todayIso, weekdayShort } from "@/lib/time";
import { cn } from "@/lib/utils";
import { getMuster } from "@/server/attendance-admin";
import { departmentOptions } from "@/server/lookups";

export const metadata: Metadata = { title: "Monthly muster" };

type SearchParams = Promise<{ month?: string; department?: string }>;

const toneCell: Record<Tone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-destructive/10 text-destructive",
  info: "bg-info-soft text-info",
  brand: "bg-secondary text-secondary-foreground",
  highlight: "bg-highlight/10 text-highlight",
  neutral: "text-muted-foreground",
};

function shiftMonth(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export default async function MonthlyPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const current = todayIso(env.timezone).slice(0, 7);
  const month = sp.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? sp.month : current;
  const departmentId = Number(sp.department) || undefined;

  const [muster, deptOpts] = await Promise.all([getMuster(month, departmentId), departmentOptions()]);
  const qs = (m: string) => `month=${m}${departmentId ? `&department=${departmentId}` : ""}`;

  return (
    <>
      <PageHeader
        title="Monthly muster"
        description="One row per employee, one column per day, with the payroll summary."
        actions={
          <>
            <Link href={`/attendance?date=${month === current ? todayIso(env.timezone) : muster.to}`} className={buttonVariants({ variant: "ghost" })}>
              Daily view
            </Link>
            <a href={`/api/export/attendance?${qs(month)}`} className={buttonVariants({ variant: "default" })} download>
              <DownloadIcon />
              Export CSV
            </a>
          </>
        }
      />

      <div className="flex items-center gap-2">
        <Link href={`/attendance/monthly?${qs(shiftMonth(month, -1))}`} aria-label="Previous month" className={buttonVariants({ variant: "outline", size: "icon" })}>
          <ChevronLeftIcon />
        </Link>
        <span className="min-w-36 text-center text-sm font-semibold">{formatMonth(month)}</span>
        <Link
          href={`/attendance/monthly?${qs(shiftMonth(month, 1))}`}
          aria-label="Next month"
          aria-disabled={month >= current}
          tabIndex={month >= current ? -1 : undefined}
          className={cn(buttonVariants({ variant: "outline", size: "icon" }), month >= current && "pointer-events-none opacity-50")}
        >
          <ChevronRightIcon />
        </Link>
      </div>

      <FilterBar clearHref="/attendance/monthly">
        <FilterField label="Month" htmlFor="f-month">
          <Input id="f-month" name="month" type="month" defaultValue={month} max={current} className="h-9" />
        </FilterField>
        <FilterField label="Department" htmlFor="f-dept">
          <NativeSelect id="f-dept" name="department" defaultValue={sp.department ?? ""} placeholder="All departments" options={deptOpts} />
        </FilterField>
      </FilterBar>

      {muster.rows.length === 0 ? (
        <EmptyState icon={<UsersIcon />} title="No staff for this month" description="Nobody in this department was employed during the month." />
      ) : (
        <Card className="py-0">
          <div className="relative w-full overflow-x-auto">
            <table className="w-max min-w-full border-separate border-spacing-0 text-xs">
              <caption className="sr-only">Attendance codes for {formatMonth(month)}</caption>
              <thead>
                <tr>
                  <th scope="col" className="sticky left-0 z-20 min-w-40 border-b border-r bg-card px-3 py-2 text-left text-sm font-medium">
                    Employee
                  </th>
                  {muster.days.map((d) => {
                    const wd = weekdayShort(d.date);
                    return (
                      <th
                        key={d.date}
                        scope="col"
                        title={d.holiday ?? undefined}
                        className={cn("w-8 min-w-8 border-b px-0.5 py-1 text-center font-medium", d.holiday && "bg-muted")}
                      >
                        <div className="tabular-nums">{Number(d.date.slice(8))}</div>
                        <div className="text-[10px] font-normal text-muted-foreground">{wd.slice(0, 2)}</div>
                      </th>
                    );
                  })}
                  <th scope="col" className="border-b border-l px-2 py-2 text-right font-medium" title="Paid days">Paid</th>
                  <th scope="col" className="border-b px-2 py-2 text-right font-medium" title="Loss-of-pay days">LOP</th>
                  <th scope="col" className="border-b px-2 py-2 text-right font-medium" title="Absent days (incl. unmarked)">Abs</th>
                  <th scope="col" className="border-b px-2 py-2 text-right font-medium">Lates</th>
                  <th scope="col" className="border-b px-2 py-2 text-right font-medium" title="Overtime hours">OT h</th>
                </tr>
              </thead>
              <tbody>
                {muster.rows.map((r) => (
                  <tr key={r.id} className="group">
                    <th scope="row" className="sticky left-0 z-10 max-w-48 border-b border-r bg-card px-3 py-1.5 text-left font-normal group-hover:bg-muted">
                      <Link href={`/employees/${r.id}`} className="block truncate text-sm font-medium hover:text-primary">
                        {r.name}
                      </Link>
                      <div className="truncate text-muted-foreground">
                        {r.empCode}
                        {r.department ? ` · ${r.department}` : ""}
                      </div>
                    </th>
                    {r.cells.map((c) => (
                      <td
                        key={c.date}
                        title={c.title || undefined}
                        className={cn(
                          "border-b p-0.5 text-center",
                          c.off && "bg-muted/70",
                        )}
                      >
                        {c.code ? (
                          <span
                            className={cn(
                              "inline-grid h-6 w-full min-w-7 place-items-center rounded text-[11px] font-semibold",
                              c.tone ? toneCell[c.tone] : "text-muted-foreground",
                            )}
                          >
                            {c.code}
                          </span>
                        ) : null}
                      </td>
                    ))}
                    <td className="border-b border-l px-2 text-right font-semibold tabular-nums">{r.totals.paidDays}</td>
                    <td className={cn("border-b px-2 text-right tabular-nums", r.totals.lopDays > 0 && "text-destructive")}>{r.totals.lopDays}</td>
                    <td className="border-b px-2 text-right tabular-nums">{r.totals.absentDays}</td>
                    <td className="border-b px-2 text-right tabular-nums" title={r.totals.lateCut ? `${r.totals.lateCut} day cut for lates` : undefined}>
                      {r.totals.lates}
                      {r.totals.lateCut ? <span className="text-warning"> (−{r.totals.lateCut})</span> : null}
                    </td>
                    <td className="border-b px-2 text-right tabular-nums">{r.totals.overtimeHours}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground" aria-label="Legend">
        {Object.entries(attendanceCode).map(([status, code]) => {
          const label = attendanceStatus[status];
          return (
            <span key={status} className="inline-flex items-center gap-1.5">
              <span className={cn("inline-grid h-5 min-w-6 place-items-center rounded px-1 font-semibold", toneCell[label.tone])}>{code}</span>
              {label.label}
            </span>
          );
        })}
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("inline-grid h-5 min-w-6 place-items-center rounded px-1 font-semibold", toneCell.danger)}>–</span>
          No record (counted as absent)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-5 w-6 rounded bg-muted" />
          Weekly off / holiday
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Paid days count present, late, leave (paid types), holidays and weekly offs as 1 and half-days as ½, minus the late-mark cut set on each shift. LOP covers absences, unpaid leave and unmarked working days.
      </p>
    </>
  );
}
