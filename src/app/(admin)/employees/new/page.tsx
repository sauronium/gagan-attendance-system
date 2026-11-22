import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/app/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { env } from "@/lib/env";
import { requireAdmin } from "@/lib/session";
import { todayIso } from "@/lib/time";

import { createEmployeeAction } from "../actions";
import { EmployeeForm } from "../employee-form";
import { employeeFormOptions } from "../form-options";

export const metadata: Metadata = { title: "Add employee" };

export default async function NewEmployeePage() {
  const viewer = await requireAdmin();
  const options = await employeeFormOptions(viewer);

  return (
    <>
      <PageHeader
        title="Add employee"
        description="Creates the staff record, a mobile + password login and this year's leave balances."
        actions={
          <Link href="/employees" className={buttonVariants({ variant: "ghost" })}>
            <ArrowLeftIcon />
            Employees
          </Link>
        }
      />
      <Card>
        <CardContent>
          <EmployeeForm
            action={createEmployeeAction}
            withPassword
            submitLabel="Add employee"
            options={options}
            values={{
              name: "",
              empCode: "",
              mobile: "",
              email: "",
              role: "employee",
              departmentId: "",
              designation: "",
              shiftId: "",
              managerId: "",
              leavePolicyId: options.policies.length === 1 ? options.policies[0].value : "",
              workType: "office",
              joinedOn: todayIso(env.timezone),
              locationIds: [],
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}
