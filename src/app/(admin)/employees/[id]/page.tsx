import { ArrowLeftIcon, KeyRoundIcon, UserCogIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionDialog } from "@/components/app/action-dialog";
import { FormField } from "@/components/app/form-bits";
import { PageHeader } from "@/components/app/page-header";
import { badgeFrom, StatusBadge } from "@/components/app/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { attendanceStatuses } from "@/db/schema";
import { env } from "@/lib/env";
import { attendanceStatus, employeeStatus, labelOf } from "@/lib/labels";
import { formatPhone } from "@/lib/phone";
import { roleLabels } from "@/lib/roles";
import { requireAdmin } from "@/lib/session";
import { formatDate, formatDuration, formatMonth, formatTime, todayIso, weekdayShort } from "@/lib/time";
import { isFlagged } from "@/server/attendance-admin";
import { canManage, getEmployee, getEmployeeAttendanceSummary } from "@/server/employees";
import { getBalances } from "@/server/leave";

import { changeStatusAction, createLoginAction, resetPasswordAction, updateEmployeeAction } from "../actions";
import { EmployeeForm } from "../employee-form";
import { employeeFormOptions } from "../form-options";

export const metadata: Metadata = { title: "Employee" };

type Params = Promise<{ id: string }>;

export default async function EmployeePage({ params }: { params: Params }) {
  const viewer = await requireAdmin();
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const tz = env.timezone;
  const today = todayIso(tz);
  const month = today.slice(0, 7);
  const emp = await getEmployee(id);
  if (!emp) notFound();

  const [options, summary, balances] = await Promise.all([
    employeeFormOptions(viewer, id),
    getEmployeeAttendanceSummary(id, month),
    getBalances(id, Number(today.slice(0, 4))),
  ]);
  const editable = canManage(viewer, emp);
  const isSelf = viewer.employee.id === id;
  if (!options.roles.some((r) => r.value === emp.role)) {
    options.roles.push({ value: emp.role, label: roleLabels[emp.role] });
  }
  const counts = new Map(summary.byStatus.map((s) => [s.status, s.n]));

  return (
    <>
      <PageHeader
        title={emp.name}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            {badgeFrom(labelOf(employeeStatus, emp.status))}
            <span>
              {emp.empCode} · {roleLabels[emp.role]}
              {emp.designation ? ` · ${emp.designation}` : ""}
            </span>
            <span className="tabular-nums">{formatPhone(emp.mobile)}</span>
            {emp.userId ? <StatusBadge tone="info" label="Has login" /> : <StatusBadge tone="neutral" label="No login" />}
          </span>
        }
        actions={
          <>
            <Link href="/employees" className={buttonVariants({ variant: "ghost" })}>
              <ArrowLeftIcon />
              Employees
            </Link>
            {editable && emp.userId ? (
              <ActionDialog
                action={resetPasswordAction}
                hidden={{ id }}
                title={`Reset ${emp.name}'s password?`}
                description="They will be signed out on every device and must sign in with the new password."
                confirmLabel="Set password"
                trigger={
                  <Button variant="outline">
                    <KeyRoundIcon />
                    Reset password
                  </Button>
                }
              >
                <PasswordField id={`pw-reset-${id}`} />
              </ActionDialog>
            ) : null}
            {editable && !emp.userId && emp.status !== "inactive" ? (
              <ActionDialog
                action={createLoginAction}
                hidden={{ id }}
                title={`Create a login for ${emp.name}`}
                description={`They will sign in with ${formatPhone(emp.mobile)} and this password.`}
                confirmLabel="Create login"
                trigger={
                  <Button variant="outline">
                    <KeyRoundIcon />
                    Create login
                  </Button>
                }
              >
                <PasswordField id={`pw-new-${id}`} />
              </ActionDialog>
            ) : null}
            {editable && !isSelf ? (
              <ActionDialog
                action={changeStatusAction}
                hidden={{ id }}
                title="Change employment status"
                description="Inactive staff are signed out and can no longer sign in. Their records are kept."
                remark="optional"
                confirmLabel="Update status"
                trigger={
                  <Button variant="outline">
                    <UserCogIcon />
                    Change status
                  </Button>
                }
              >
                <FormField label="Status" htmlFor={`st-${id}`} required>
                  <NativeSelect
                    id={`st-${id}`}
                    name="status"
                    required
                    defaultValue={emp.status}
                    options={[
                      { value: "active", label: "Active" },
                      { value: "on_notice", label: "On notice" },
                      { value: "inactive", label: "Inactive (left)" },
                    ]}
                  />
                </FormField>
                <FormField
                  label="Last working day"
                  htmlFor={`left-${id}`}
                  hint="For inactive or on-notice staff. Blank when marking inactive means today."
                >
                  <Input id={`left-${id}`} name="leftOn" type="date" defaultValue={emp.leftOn ?? ""} />
                </FormField>
              </ActionDialog>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
            <CardDescription>
              {editable
                ? "Changes to name, mobile and email are copied to the login."
                : "Only a Super Admin can change an admin's record."}
              {emp.leftOn ? ` Last working day: ${formatDate(emp.leftOn)}.` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EmployeeForm
              action={updateEmployeeAction}
              submitLabel="Save changes"
              disabled={!editable}
              options={options}
              values={{
                id: emp.id,
                name: emp.name,
                empCode: emp.empCode,
                mobile: emp.mobile,
                email: emp.email ?? "",
                role: emp.role,
                departmentId: emp.departmentId ? String(emp.departmentId) : "",
                designation: emp.designation ?? "",
                shiftId: emp.shiftId ? String(emp.shiftId) : "",
                managerId: emp.managerId ? String(emp.managerId) : "",
                leavePolicyId: emp.leavePolicyId ? String(emp.leavePolicyId) : "",
                workType: emp.workType,
                joinedOn: emp.joinedOn ?? "",
                locationIds: emp.locations.map((l) => String(l.locationId)),
              }}
            />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card size="sm">
            <CardHeader>
              <CardTitle>{formatMonth(month)}</CardTitle>
              <CardDescription>
                <Link href={`/attendance/monthly?month=${month}`} className="text-primary hover:underline">
                  Open monthly muster
                </Link>
              </CardDescription>
            </CardHeader>
            <CardContent>
              {summary.byStatus.length ? (
                <dl className="grid grid-cols-2 gap-2">
                  {attendanceStatuses
                    .filter((s) => counts.get(s))
                    .map((s) => (
                      <div key={s} className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-2.5 py-1.5">
                        <dt>{badgeFrom(labelOf(attendanceStatus, s))}</dt>
                        <dd className="font-semibold tabular-nums">{counts.get(s)}</dd>
                      </div>
                    ))}
                </dl>
              ) : (
                <p className="text-muted-foreground">No attendance recorded this month.</p>
              )}
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Leave balance</CardTitle>
              <CardDescription>{emp.leavePolicy?.name ?? "No leave policy"} · {today.slice(0, 4)}</CardDescription>
            </CardHeader>
            <CardContent>
              {balances.length ? (
                <ul className="flex flex-col">
                  {balances.map((b) => (
                    <li key={b.leaveTypeId} className="flex items-center justify-between gap-2 border-b border-dashed py-1.5 last:border-0">
                      <span className="min-w-0 truncate" title={b.name}>
                        <span className="font-medium">{b.code}</span>
                        <span className="text-muted-foreground"> · {b.name}</span>
                      </span>
                      <span className="shrink-0 tabular-nums">
                        <span className={b.available <= 0 && b.isPaid ? "font-semibold text-destructive" : "font-semibold"}>{b.available}</span>
                        <span className="text-xs text-muted-foreground"> left · {b.used} used</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">No leave types set up.</p>
              )}
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Recent days</CardTitle>
              <CardDescription>Last 10 days on record</CardDescription>
            </CardHeader>
            <CardContent>
              {summary.recent.length ? (
                <ul className="flex flex-col">
                  {summary.recent.map((d) => (
                    <li key={d.date} className="flex items-center justify-between gap-2 border-b border-dashed py-1.5 last:border-0">
                      <Link
                        href={`/attendance?date=${d.date}&q=${encodeURIComponent(emp.empCode)}`}
                        className="min-w-0 hover:text-primary"
                      >
                        <div className="font-medium">
                          {weekdayShort(d.date)}, {formatDate(d.date)}
                        </div>
                        <div className="text-xs text-muted-foreground tabular-nums">
                          {d.checkInAt ? `${formatTime(d.checkInAt, tz)} – ${formatTime(d.checkOutAt, tz)}` : "No punches"}
                          {d.workedMinutes ? ` · ${formatDuration(d.workedMinutes)}` : ""}
                        </div>
                      </Link>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        {badgeFrom(labelOf(attendanceStatus, d.status))}
                        {isFlagged(d.flags) ? <StatusBadge tone="danger" label="Flagged" /> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">No attendance yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function PasswordField({ id }: { id: string }) {
  return (
    <FormField label="New password" htmlFor={id} required hint="At least 8 characters. Share it with the employee privately.">
      <Input id={id} name="password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" />
    </FormField>
  );
}
