import { eq } from "drizzle-orm";
import {
  AlertTriangleIcon,
  CalendarClockIcon,
  CalendarDaysIcon,
  CalendarOffIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardCheckIcon,
  UserCheckIcon,
  UserMinusIcon,
  UserXIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ActionButton, ActionDialog } from "@/components/app/action-dialog";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar, FilterField } from "@/components/app/filter-bar";
import { LinkTabs } from "@/components/app/link-tabs";
import { PageHeader, SectionTitle } from "@/components/app/page-header";
import { PhotoThumb } from "@/components/app/photo-thumb";
import { StatCard } from "@/components/app/stat-card";
import { badgeFrom, StatusBadge } from "@/components/app/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db";
import { attendanceStatuses, regularisations } from "@/db/schema";
import { env } from "@/lib/env";
import { formatDistance } from "@/lib/geo";
import { attendanceStatus, labelOf, requestStatus } from "@/lib/labels";
import { requireAdmin } from "@/lib/session";
import { fileUrl } from "@/lib/storage";
import { addDays, formatDate, formatDateTime, formatDuration, formatTime, todayIso, weekdayShort } from "@/lib/time";
import { cn } from "@/lib/utils";
import {
  type DailyEntry,
  getDailyRegister,
  isFlagged,
  listRegularisations,
  summarise,
  toTimeInput,
} from "@/server/attendance-admin";
import { departmentOptions } from "@/server/lookups";

import { approveRegularisationAction, rejectRegularisationAction } from "./actions";
import { EditAttendanceDialog } from "./edit-attendance-dialog";

export const metadata: Metadata = { title: "Attendance" };

type SearchParams = Promise<{
  tab?: string;
  date?: string;
  department?: string;
  status?: string;
  flagged?: string;
  q?: string;
}>;

const statusOptions = attendanceStatuses.map((s) => ({ value: s, label: labelOf(attendanceStatus, s).label }));

const regType: Record<string, string> = {
  missed_check_in: "Missed check-in",
  missed_check_out: "Missed check-out",
  wrong_status: "Wrong status",
  on_duty: "On duty",
};

export default async function AttendancePage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const tab = sp.tab === "corrections" ? "corrections" : "daily";
  const pending = await db.$count(regularisations, eq(regularisations.status, "pending"));
  const today = todayIso(env.timezone);

  return (
    <>
      <PageHeader
        title="Attendance"
        description="Daily register, check-in photos and flags, manual corrections."
        actions={
          <Link href={`/attendance/monthly?month=${(isIsoDate(sp.date) ? sp.date : today).slice(0, 7)}`} className={buttonVariants({ variant: "outline" })}>
            <CalendarDaysIcon />
            Monthly muster
          </Link>
        }
      />
      <LinkTabs
        active={tab}
        tabs={[
          { key: "daily", label: "Daily", href: "/attendance" },
          { key: "corrections", label: "Corrections", href: "/attendance?tab=corrections", count: pending },
        ]}
      />
      {tab === "daily" ? <Daily sp={sp} today={today} /> : <Corrections />}
    </>
  );
}

function isIsoDate(v: string | undefined): v is string {
  return Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)));
}

async function Daily({ sp, today }: { sp: Awaited<SearchParams>; today: string }) {
  const tz = env.timezone;
  const date = isIsoDate(sp.date) ? sp.date : today;
  const departmentId = Number(sp.department) || undefined;
  const status = sp.status && (sp.status === "not_checked_in" || (attendanceStatuses as readonly string[]).includes(sp.status)) ? sp.status : "";
  const flaggedOnly = sp.flagged === "1";

  const [entries, deptOpts] = await Promise.all([
    getDailyRegister(date, { departmentId, q: sp.q }),
    departmentOptions(),
  ]);
  const c = summarise(entries);
  const visible = entries.filter(({ row, off }) => {
    if (flaggedOnly && !isFlagged(row?.flags)) return false;
    if (status === "not_checked_in") return !row && !off;
    if (status) return (row?.status ?? off) === status;
    return true;
  });

  const link = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { date, department: sp.department, status, flagged: flaggedOnly ? "1" : undefined, q: sp.q, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/attendance?${p.toString()}`;
  };
  const dateLabel = `${weekdayShort(date)}, ${formatDate(date)}`;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={link({ date: addDays(date, -1) })} aria-label="Previous day" className={buttonVariants({ variant: "outline", size: "icon" })}>
          <ChevronLeftIcon />
        </Link>
        <span className="min-w-36 text-center text-sm font-semibold">
          {dateLabel}
          {date === today ? <span className="ml-1 font-normal text-muted-foreground">(today)</span> : null}
        </span>
        <Link
          href={link({ date: addDays(date, 1) })}
          aria-label="Next day"
          aria-disabled={date >= today}
          className={cn(buttonVariants({ variant: "outline", size: "icon" }), date >= today && "pointer-events-none opacity-50")}
          tabIndex={date >= today ? -1 : undefined}
        >
          <ChevronRightIcon />
        </Link>
        {date !== today ? (
          <Link href={link({ date: today })} className={buttonVariants({ variant: "ghost" })}>
            Today
          </Link>
        ) : null}
      </div>

      <section aria-label="Summary" className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        <StatCard label="Present" value={c.present} tone="success" icon={<UserCheckIcon />} href={link({ status: "present", flagged: undefined })} />
        <StatCard label="Late" value={c.late} tone="warning" icon={<CalendarClockIcon />} href={link({ status: "late", flagged: undefined })} />
        <StatCard label="Half-day" value={c.halfDay} tone="warning" icon={<UserMinusIcon />} href={link({ status: "half_day", flagged: undefined })} />
        <StatCard label="On leave" value={c.onLeave} tone="brand" icon={<CalendarOffIcon />} href={link({ status: "on_leave", flagged: undefined })} />
        <StatCard label="Absent" value={c.absent} tone={c.absent ? "danger" : "default"} icon={<UserXIcon />} href={link({ status: "absent", flagged: undefined })} />
        <StatCard
          label="Not checked in"
          value={c.notCheckedIn}
          hint={c.off ? `${c.off} on week off / holiday` : undefined}
          tone={c.notCheckedIn ? "danger" : "default"}
          icon={<UserXIcon />}
          href={link({ status: "not_checked_in", flagged: undefined })}
        />
        <StatCard label="Flagged" value={c.flagged} tone={c.flagged ? "danger" : "default"} icon={<AlertTriangleIcon />} href={link({ flagged: "1", status: undefined })} />
      </section>

      <FilterBar clearHref={`/attendance?date=${date}`}>
        <FilterField label="Date" htmlFor="f-date">
          <Input id="f-date" name="date" type="date" defaultValue={date} max={today} className="h-9" />
        </FilterField>
        <FilterField label="Search" htmlFor="f-q" className="sm:min-w-48">
          <Input id="f-q" name="q" type="search" defaultValue={sp.q ?? ""} placeholder="Name or code" className="h-9" />
        </FilterField>
        <FilterField label="Department" htmlFor="f-dept">
          <NativeSelect id="f-dept" name="department" defaultValue={sp.department ?? ""} placeholder="All departments" options={deptOpts} />
        </FilterField>
        <FilterField label="Status" htmlFor="f-status">
          <NativeSelect
            id="f-status"
            name="status"
            defaultValue={status}
            placeholder="All statuses"
            options={[{ value: "not_checked_in", label: "Not checked in" }, ...statusOptions]}
          />
        </FilterField>
        <div className="flex h-9 items-center gap-2 sm:self-end">
          <Checkbox id="f-flagged" name="flagged" value="1" defaultChecked={flaggedOnly} />
          <label htmlFor="f-flagged" className="text-sm">Flagged only</label>
        </div>
      </FilterBar>

      {visible.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheckIcon />}
          title={entries.length ? "No one matches these filters" : "No staff to show"}
          description={entries.length ? "Try clearing a filter." : "Add employees to start tracking attendance."}
        />
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Check-in</TableHead>
                <TableHead className="hidden sm:table-cell">Check-out</TableHead>
                <TableHead className="hidden text-right md:table-cell">Worked</TableHead>
                <TableHead className="hidden lg:table-cell">Location / flags</TableHead>
                <TableHead className="hidden xl:table-cell">Note</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((entry) => (
                <DailyRow key={entry.employee.id} entry={entry} date={date} dateLabel={dateLabel} tz={tz} />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <p className="text-xs text-muted-foreground">
        Showing {visible.length} of {entries.length} staff. Edits recalculate the day from the shift rules and are kept in the audit log.
      </p>
    </>
  );
}

function DailyRow({ entry, date, dateLabel, tz }: { entry: DailyEntry; date: string; dateLabel: string; tz: string }) {
  const { employee: e, row, off } = entry;
  const flags = row?.flags ?? {};
  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{e.name}</div>
        <div className="text-xs text-muted-foreground">
          {e.empCode}
          {e.department ? ` · ${e.department.name}` : ""}
        </div>
      </TableCell>
      <TableCell>
        {badgeFrom(labelOf(attendanceStatus, row?.status ?? off ?? "not_checked_in"))}
        {row && row.lateMinutes > 0 && row.status !== "on_leave" ? (
          <div className="mt-1 text-xs text-muted-foreground">{formatDuration(row.lateMinutes)} late</div>
        ) : null}
      </TableCell>
      <TableCell>
        {row?.checkInAt ? (
          <div className="flex items-center gap-2">
            <PhotoThumb src={fileUrl(row.checkInPhotoKey)} alt={`${e.name} check-in photo`} size={32} />
            <span className="tabular-nums">{formatTime(row.checkInAt, tz)}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        {row?.checkOutAt ? (
          <div className="flex items-center gap-2">
            <PhotoThumb src={fileUrl(row.checkOutPhotoKey)} alt={`${e.name} check-out photo`} size={32} />
            <span className="tabular-nums">{formatTime(row.checkOutAt, tz)}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="hidden text-right tabular-nums md:table-cell">
        {row?.workedMinutes ? formatDuration(row.workedMinutes) : "—"}
        {row?.overtimeMinutes ? <div className="text-xs text-info">+{formatDuration(row.overtimeMinutes)} OT</div> : null}
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        <div className="flex max-w-64 flex-wrap items-center gap-1">
          {row?.checkInLocation ? <span className="mr-1 text-xs text-muted-foreground">{row.checkInLocation.name}</span> : null}
          {flags.weakGps ? (
            <StatusBadge tone="warning" label={`Weak GPS${row?.checkInAccuracyM != null ? ` ±${row.checkInAccuracyM} m` : ""}`} />
          ) : null}
          {flags.outsideOffice ? <StatusBadge tone="danger" label={`Outside office · ${formatDistance(row?.checkInDistanceM)}`} /> : null}
          {flags.newDevice ? <StatusBadge tone="danger" label="New device" /> : null}
          {flags.manualEdit ? <StatusBadge tone="info" label="Edited" /> : null}
          {flags.autoMarked ? <StatusBadge tone="neutral" label="Auto" /> : null}
          {!row?.checkInLocation && !isFlagged(flags) && !flags.manualEdit && !flags.autoMarked ? (
            <span className="text-muted-foreground">—</span>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="hidden max-w-48 truncate text-muted-foreground xl:table-cell" title={row?.note ?? ""}>
        {row?.note ?? "—"}
      </TableCell>
      <TableCell className="text-right">
        <EditAttendanceDialog
          employeeId={e.id}
          employeeName={e.name}
          date={date}
          dateLabel={dateLabel}
          status={row?.status ?? null}
          checkIn={toTimeInput(row?.checkInAt, tz)}
          checkOut={toTimeInput(row?.checkOutAt, tz)}
          note={row?.note ?? ""}
          statusOptions={statusOptions}
        />
      </TableCell>
    </TableRow>
  );
}

async function Corrections() {
  const tz = env.timezone;
  const { pending, recent } = await listRegularisations();
  type Reg = (typeof pending)[number] & { decidedByEmployee?: { name: string } | null };

  const table = (rows: Reg[], showActions: boolean) => (
    <Card className="py-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Employee</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="hidden sm:table-cell">Requested times</TableHead>
            <TableHead className="hidden lg:table-cell">Reason</TableHead>
            <TableHead>{showActions ? <span className="sr-only">Actions</span> : "Status"}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                <div className="font-medium">{r.employee.name}</div>
                <div className="text-xs text-muted-foreground">
                  {r.employee.empCode} · {formatDateTime(r.createdAt, tz)}
                </div>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                <Link href={`/attendance?date=${r.date}&q=${encodeURIComponent(r.employee.empCode)}`} className="hover:text-primary hover:underline">
                  {weekdayShort(r.date)}, {formatDate(r.date)}
                </Link>
              </TableCell>
              <TableCell>{regType[r.type] ?? r.type}</TableCell>
              <TableCell className="hidden tabular-nums sm:table-cell">
                {r.requestedCheckInAt || r.requestedCheckOutAt ? (
                  <>
                    {r.requestedCheckInAt ? `In ${formatTime(r.requestedCheckInAt, tz)}` : ""}
                    {r.requestedCheckInAt && r.requestedCheckOutAt ? " · " : ""}
                    {r.requestedCheckOutAt ? `Out ${formatTime(r.requestedCheckOutAt, tz)}` : ""}
                  </>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="hidden max-w-72 truncate text-muted-foreground lg:table-cell" title={r.reason}>
                {r.reason}
              </TableCell>
              <TableCell className={showActions ? "text-right" : undefined}>
                {showActions ? (
                  <div className="flex justify-end gap-1.5">
                    <ActionButton action={approveRegularisationAction} hidden={{ id: r.id }} pendingLabel="Approving…">
                      Approve
                    </ActionButton>
                    <ActionDialog
                      action={rejectRegularisationAction}
                      hidden={{ id: r.id }}
                      remark="required"
                      title={`Reject ${r.employee.name}'s correction?`}
                      description={`${regType[r.type] ?? r.type} on ${formatDate(r.date)}. Reason: ${r.reason}`}
                      confirmLabel="Reject"
                      destructive
                      trigger={<Button size="sm" variant="outline">Reject</Button>}
                    />
                  </div>
                ) : (
                  <>
                    {badgeFrom(labelOf(requestStatus, r.status))}
                    {r.decisionRemark ? (
                      <div className="mt-1 max-w-48 truncate text-xs text-muted-foreground" title={r.decisionRemark}>
                        {r.decisionRemark}
                      </div>
                    ) : r.decidedByEmployee ? (
                      <div className="mt-1 text-xs text-muted-foreground">by {r.decidedByEmployee.name}</div>
                    ) : null}
                  </>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );

  return (
    <>
      <SectionTitle>Pending ({pending.length})</SectionTitle>
      {pending.length ? (
        table(pending, true)
      ) : (
        <EmptyState
          icon={<ClipboardCheckIcon />}
          title="No corrections waiting"
          description="Missed punches, wrong statuses and on-duty requests from the staff app appear here."
        />
      )}
      {recent.length ? (
        <>
          <SectionTitle>Recently decided</SectionTitle>
          {table(recent, false)}
        </>
      ) : null}
    </>
  );
}
