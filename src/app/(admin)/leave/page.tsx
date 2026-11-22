import { and, asc, desc, eq, gte, lte, ne, type SQL } from "drizzle-orm";
import { CalendarOffIcon } from "lucide-react";
import type { Metadata } from "next";

import { ActionButton, ActionDialog } from "@/components/app/action-dialog";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar, FilterField } from "@/components/app/filter-bar";
import { LinkTabs } from "@/components/app/link-tabs";
import { PageHeader } from "@/components/app/page-header";
import { badgeFrom } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db";
import { employees, holidays, leaveBalances, leaveRequests, leaveTypes } from "@/db/schema";
import { env } from "@/lib/env";
import { labelOf, requestStatus } from "@/lib/labels";
import { requireAdmin } from "@/lib/session";
import { formatDate, formatDateTime, todayIso, weekdayShort } from "@/lib/time";
import { employeeOptions, leaveTypeOptions } from "@/server/lookups";

import {
  approveLeaveAction,
  cancelLeaveAction,
  deleteHolidayAction,
  rejectLeaveAction,
} from "./actions";
import { HolidayForm } from "./holiday-form";

export const metadata: Metadata = { title: "Leave" };

type SearchParams = Promise<{
  tab?: string;
  status?: string;
  employee?: string;
  type?: string;
  year?: string;
}>;

export default async function LeavePage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const tab = sp.tab === "balances" || sp.tab === "holidays" ? sp.tab : "requests";
  const today = todayIso(env.timezone);
  const year = Number(sp.year) || Number(today.slice(0, 4));

  const pendingCount = await db.$count(leaveRequests, eq(leaveRequests.status, "pending"));

  return (
    <>
      <PageHeader title="Leave" description="Approve requests, track balances and manage the holiday calendar." />
      <LinkTabs
        active={tab}
        tabs={[
          { key: "requests", label: "Requests", href: "/leave", count: pendingCount },
          { key: "balances", label: "Balances", href: `/leave?tab=balances&year=${year}` },
          { key: "holidays", label: "Holidays", href: `/leave?tab=holidays&year=${year}` },
        ]}
      />
      {tab === "requests" ? <Requests sp={sp} today={today} /> : null}
      {tab === "balances" ? <Balances year={year} /> : null}
      {tab === "holidays" ? <Holidays year={year} /> : null}
    </>
  );
}

async function Requests({ sp, today }: { sp: Awaited<SearchParams>; today: string }) {
  const status = sp.status ?? "pending";
  const where: SQL[] = [];
  if (status !== "all") where.push(eq(leaveRequests.status, status as "pending"));
  if (sp.employee) where.push(eq(leaveRequests.employeeId, Number(sp.employee)));
  if (sp.type) where.push(eq(leaveRequests.leaveTypeId, Number(sp.type)));

  const [rows, empOpts, typeOpts] = await Promise.all([
    db.query.leaveRequests.findMany({
      where: where.length ? and(...where) : undefined,
      orderBy: [asc(leaveRequests.status), desc(leaveRequests.createdAt)],
      limit: 200,
      with: {
        employee: { columns: { name: true, empCode: true } },
        leaveType: { columns: { code: true, name: true } },
        approver: { columns: { name: true } },
      },
    }),
    employeeOptions(),
    leaveTypeOptions(),
  ]);

  return (
    <>
      <FilterBar clearHref="/leave">
        <FilterField label="Status" htmlFor="f-status">
          <NativeSelect
            id="f-status"
            name="status"
            defaultValue={status}
            options={[
              { value: "pending", label: "Pending" },
              { value: "approved", label: "Approved" },
              { value: "rejected", label: "Rejected" },
              { value: "cancelled", label: "Cancelled" },
              { value: "withdrawn", label: "Withdrawn" },
              { value: "all", label: "All" },
            ]}
          />
        </FilterField>
        <FilterField label="Employee" htmlFor="f-emp" className="sm:min-w-56">
          <NativeSelect id="f-emp" name="employee" defaultValue={sp.employee ?? ""} placeholder="All employees" options={empOpts} />
        </FilterField>
        <FilterField label="Leave type" htmlFor="f-type">
          <NativeSelect id="f-type" name="type" defaultValue={sp.type ?? ""} placeholder="All types" options={typeOpts} />
        </FilterField>
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState
          icon={<CalendarOffIcon />}
          title={status === "pending" ? "No pending leave requests" : "No leave requests match"}
          description="Requests from the staff app appear here for approval."
        />
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead className="text-right">Days</TableHead>
                <TableHead className="hidden lg:table-cell">Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="font-medium">{r.employee.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.employee.empCode} · applied {formatDateTime(r.createdAt, env.timezone)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{r.leaveType.code}</span>
                    <span className="hidden text-muted-foreground xl:inline"> · {r.leaveType.name}</span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {r.fromDate === r.toDate
                      ? `${weekdayShort(r.fromDate)}, ${formatDate(r.fromDate)}`
                      : `${formatDate(r.fromDate)} – ${formatDate(r.toDate)}`}
                    {r.halfDay ? (
                      <div className="text-xs text-muted-foreground">
                        {r.halfDay === "first_half" ? "First half" : "Second half"}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.days}</TableCell>
                  <TableCell className="hidden max-w-64 truncate text-muted-foreground lg:table-cell" title={r.reason ?? ""}>
                    {r.reason ?? "—"}
                  </TableCell>
                  <TableCell>
                    {badgeFrom(labelOf(requestStatus, r.status))}
                    {r.decisionRemark ? (
                      <div className="mt-1 max-w-48 truncate text-xs text-muted-foreground" title={r.decisionRemark}>
                        {r.decisionRemark}
                      </div>
                    ) : r.approver ? (
                      <div className="mt-1 text-xs text-muted-foreground">by {r.approver.name}</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.status === "pending" ? (
                      <div className="flex justify-end gap-1.5">
                        <ActionButton action={approveLeaveAction} hidden={{ id: r.id }} pendingLabel="Approving…">
                          Approve
                        </ActionButton>
                        <ActionDialog
                          action={rejectLeaveAction}
                          hidden={{ id: r.id }}
                          remark="required"
                          title={`Reject ${r.employee.name}'s leave?`}
                          description={`${r.leaveType.name}, ${formatDate(r.fromDate)}${r.fromDate !== r.toDate ? ` – ${formatDate(r.toDate)}` : ""} (${r.days} day${r.days === 1 ? "" : "s"})`}
                          confirmLabel="Reject"
                          destructive
                          trigger={<Button size="sm" variant="outline">Reject</Button>}
                        />
                      </div>
                    ) : r.status === "approved" && r.fromDate > today ? (
                      <ActionDialog
                        action={cancelLeaveAction}
                        hidden={{ id: r.id }}
                        remark="optional"
                        title="Cancel approved leave?"
                        description="The days go back to the employee's balance and are removed from the roster."
                        confirmLabel="Cancel leave"
                        destructive
                        trigger={<Button size="sm" variant="ghost">Cancel</Button>}
                      />
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}

async function Balances({ year }: { year: number }) {
  const [staff, types, balances] = await Promise.all([
    db
      .select({ id: employees.id, name: employees.name, code: employees.empCode })
      .from(employees)
      .where(ne(employees.status, "inactive"))
      .orderBy(asc(employees.name)),
    db.select().from(leaveTypes).where(eq(leaveTypes.isActive, true)).orderBy(asc(leaveTypes.code)),
    db.select().from(leaveBalances).where(eq(leaveBalances.year, year)),
  ]);
  const key = (e: number, t: number) => `${e}:${t}`;
  const map = new Map(balances.map((b) => [key(b.employeeId, b.leaveTypeId), b]));
  const paidTypes = types.filter((t) => t.isPaid);

  return (
    <>
      <FilterBar>
        <input type="hidden" name="tab" value="balances" />
        <FilterField label="Year" htmlFor="f-year">
          <NativeSelect
            id="f-year"
            name="year"
            defaultValue={String(year)}
            options={[year - 1, year, year + 1].map((y) => ({ value: String(y), label: String(y) }))}
          />
        </FilterField>
      </FilterBar>
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              {paidTypes.map((t) => (
                <TableHead key={t.id} className="text-right" title={t.name}>
                  {t.code} <span className="font-normal text-muted-foreground">left / used</span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {staff.map((e) => (
              <TableRow key={e.id}>
                <TableCell>
                  <div className="font-medium">{e.name}</div>
                  <div className="text-xs text-muted-foreground">{e.code}</div>
                </TableCell>
                {paidTypes.map((t) => {
                  const b = map.get(key(e.id, t.id));
                  const available = b ? b.opening + b.credited + b.adjusted - b.used : 0;
                  return (
                    <TableCell key={t.id} className="text-right tabular-nums">
                      <span className={available <= 0 ? "font-semibold text-destructive" : "font-semibold"}>
                        {available}
                      </span>
                      <span className="text-muted-foreground"> / {b?.used ?? 0}</span>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <p className="text-xs text-muted-foreground">
        Left = opening + credited + adjustments − used. Monthly accrual and year-end carry forward run automatically.
      </p>
    </>
  );
}

async function Holidays({ year }: { year: number }) {
  const rows = await db
    .select()
    .from(holidays)
    .where(and(gte(holidays.date, `${year}-01-01`), lte(holidays.date, `${year}-12-31`)))
    .orderBy(asc(holidays.date));

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <Card className="py-0">
        {rows.length === 0 ? (
          <div className="p-6">
            <EmptyState title={`No holidays for ${year}`} description="Add the year's holidays so leave and attendance skip them." />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Holiday</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="whitespace-nowrap">
                    {weekdayShort(h.date)}, {formatDate(h.date)}
                  </TableCell>
                  <TableCell className="font-medium">{h.name}</TableCell>
                  <TableCell className="text-muted-foreground">{h.isOptional ? "Optional" : "Company holiday"}</TableCell>
                  <TableCell className="text-right">
                    <ActionDialog
                      action={deleteHolidayAction}
                      hidden={{ id: h.id }}
                      title={`Remove ${h.name}?`}
                      confirmLabel="Remove"
                      destructive
                      trigger={<Button size="sm" variant="ghost">Remove</Button>}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Add a holiday</CardTitle>
          <CardDescription>Company holidays are skipped when counting leave days.</CardDescription>
        </CardHeader>
        <CardContent>
          <HolidayForm />
        </CardContent>
      </Card>
    </div>
  );
}
