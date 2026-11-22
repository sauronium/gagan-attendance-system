import "server-only";

import { employeeRoles, workTypes } from "@/db/schema";
import { workType } from "@/lib/labels";
import { isAdmin, roleLabels } from "@/lib/roles";
import type { Viewer } from "@/lib/session";
import {
  departmentOptions,
  employeeOptions,
  leavePolicyOptions,
  officeLocationOptions,
  shiftOptions,
} from "@/server/lookups";

/** Select options for the employee form. Office Admins can't hand out admin roles. */
export async function employeeFormOptions(viewer: Viewer, excludeId?: number) {
  const [departments, shifts, managers, policies, locations] = await Promise.all([
    departmentOptions(),
    shiftOptions(),
    employeeOptions(),
    leavePolicyOptions(),
    officeLocationOptions(),
  ]);
  const superAdmin = viewer.employee.role === "super_admin";
  return {
    roles: employeeRoles
      .filter((r) => superAdmin || !isAdmin(r))
      .map((r) => ({ value: r, label: roleLabels[r] })),
    departments,
    shifts,
    managers: managers.filter((m) => m.value !== String(excludeId)),
    policies,
    workTypes: workTypes.map((w) => ({ value: w, label: workType[w] })),
    locations,
  };
}
