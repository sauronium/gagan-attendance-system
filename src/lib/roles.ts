import type { EmployeeRole } from "@/db/schema/people";

// Role rules shared by server and client. The server is the authority:
// pages call requireRole() and actions re-check before writing.

export const ADMIN_ROLES = ["super_admin", "office_admin"] as const satisfies
  readonly EmployeeRole[];

export const roleLabels: Record<EmployeeRole, string> = {
  super_admin: "Super Admin",
  office_admin: "Office Admin",
  employee: "Employee",
  technician: "AMC Technician",
};

export function isAdmin(role: EmployeeRole): boolean {
  return (ADMIN_ROLES as readonly string[]).includes(role);
}

/** Where a user lands after signing in. */
export function homeFor(role: EmployeeRole): string {
  return isAdmin(role) ? "/dashboard" : "/me";
}
