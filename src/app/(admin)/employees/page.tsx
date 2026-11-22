import { CheckIcon, MinusIcon, UserPlusIcon, UsersIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/app/empty-state";
import { FilterBar, FilterField } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { badgeFrom } from "@/components/app/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type EmployeeRole, employeeRoles, type EmployeeStatus } from "@/db/schema";
import { employeeStatus, labelOf, workType } from "@/lib/labels";
import { formatPhone } from "@/lib/phone";
import { roleLabels } from "@/lib/roles";
import { requireAdmin } from "@/lib/session";
import { listEmployees } from "@/server/employees";
import { departmentOptions } from "@/server/lookups";

export const metadata: Metadata = { title: "Employees" };

type SearchParams = Promise<{ q?: string; department?: string; role?: string; status?: string }>;

export default async function EmployeesPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const role = (employeeRoles as readonly string[]).includes(sp.role ?? "") ? (sp.role as EmployeeRole) : undefined;
  const status = ["active", "on_notice", "inactive", "all"].includes(sp.status ?? "")
    ? (sp.status as EmployeeStatus | "all")
    : "";

  const [rows, deptOpts] = await Promise.all([
    listEmployees({ q: sp.q, departmentId: Number(sp.department) || undefined, role, status }),
    departmentOptions(),
  ]);
  const filtered = Boolean(sp.q || sp.department || role || status);

  return (
    <>
      <PageHeader
        title="Employees"
        description="Staff records, roles, shifts and sign-in access."
        actions={
          <Link href="/employees/new" className={buttonVariants({ variant: "default" })}>
            <UserPlusIcon />
            Add employee
          </Link>
        }
      />

      <FilterBar clearHref="/employees">
        <FilterField label="Search" htmlFor="f-q" className="sm:min-w-56">
          <Input id="f-q" name="q" type="search" defaultValue={sp.q ?? ""} placeholder="Name, code or mobile" className="h-9" />
        </FilterField>
        <FilterField label="Department" htmlFor="f-dept">
          <NativeSelect id="f-dept" name="department" defaultValue={sp.department ?? ""} placeholder="All departments" options={deptOpts} />
        </FilterField>
        <FilterField label="Role" htmlFor="f-role">
          <NativeSelect
            id="f-role"
            name="role"
            defaultValue={role ?? ""}
            placeholder="All roles"
            options={employeeRoles.map((r) => ({ value: r, label: roleLabels[r] }))}
          />
        </FilterField>
        <FilterField label="Status" htmlFor="f-status">
          <NativeSelect
            id="f-status"
            name="status"
            defaultValue={status}
            placeholder="Current staff"
            options={[
              { value: "active", label: "Active" },
              { value: "on_notice", label: "On notice" },
              { value: "inactive", label: "Inactive" },
              { value: "all", label: "Everyone" },
            ]}
          />
        </FilterField>
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState
          icon={<UsersIcon />}
          title={filtered ? "No employees match" : "No employees yet"}
          description={filtered ? "Try a different search or clear the filters." : "Add your first employee to give them a login."}
          action={
            filtered ? undefined : (
              <Link href="/employees/new" className={buttonVariants({ variant: "default" })}>
                Add employee
              </Link>
            )
          }
        />
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead className="hidden sm:table-cell">Role</TableHead>
                <TableHead className="hidden md:table-cell">Department</TableHead>
                <TableHead className="hidden lg:table-cell">Mobile</TableHead>
                <TableHead className="hidden xl:table-cell">Shift</TableHead>
                <TableHead className="hidden xl:table-cell">Work type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell text-center">Login</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>
                    <Link href={`/employees/${e.id}`} className="font-medium hover:text-primary hover:underline">
                      {e.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {e.empCode}
                      {e.designation ? ` · ${e.designation}` : ""}
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{roleLabels[e.role]}</TableCell>
                  <TableCell className="hidden md:table-cell">{e.department?.name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="hidden tabular-nums lg:table-cell">
                    <a href={`tel:${e.mobile}`} className="hover:text-primary">
                      {formatPhone(e.mobile)}
                    </a>
                  </TableCell>
                  <TableCell className="hidden xl:table-cell">{e.shift?.name ?? <span className="text-muted-foreground">Default</span>}</TableCell>
                  <TableCell className="hidden xl:table-cell">{workType[e.workType] ?? e.workType}</TableCell>
                  <TableCell>{badgeFrom(labelOf(employeeStatus, e.status))}</TableCell>
                  <TableCell className="hidden text-center md:table-cell">
                    {e.userId ? (
                      <CheckIcon className="mx-auto size-4 text-success" aria-label="Has login" />
                    ) : (
                      <MinusIcon className="mx-auto size-4 text-muted-foreground" aria-label="No login" />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <p className="text-xs text-muted-foreground">
        {rows.length} employee{rows.length === 1 ? "" : "s"}
      </p>
    </>
  );
}
