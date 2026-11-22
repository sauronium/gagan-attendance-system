import "server-only";

import { and, asc, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import {
  clients,
  departments,
  employees,
  leavePolicies,
  leaveTypes,
  officeLocations,
  shifts,
  smsTemplates,
} from "@/db/schema";

// Small lists used to fill <select>s and filter bars across modules.

export type Option = { value: string; label: string };

export async function departmentOptions(): Promise<Option[]> {
  const rows = await db
    .select({ id: departments.id, name: departments.name })
    .from(departments)
    .where(eq(departments.isActive, true))
    .orderBy(asc(departments.name));
  return rows.map((r) => ({ value: String(r.id), label: r.name }));
}

export async function shiftOptions(): Promise<Option[]> {
  const rows = await db
    .select({ id: shifts.id, name: shifts.name, start: shifts.startTime, end: shifts.endTime })
    .from(shifts)
    .where(eq(shifts.isActive, true))
    .orderBy(asc(shifts.name));
  return rows.map((r) => ({
    value: String(r.id),
    label: `${r.name} (${r.start.slice(0, 5)}–${r.end.slice(0, 5)})`,
  }));
}

export async function leavePolicyOptions(): Promise<Option[]> {
  const rows = await db
    .select({ id: leavePolicies.id, name: leavePolicies.name })
    .from(leavePolicies)
    .where(eq(leavePolicies.isActive, true));
  return rows.map((r) => ({ value: String(r.id), label: r.name }));
}

export async function leaveTypeOptions(): Promise<Option[]> {
  const rows = await db
    .select({ id: leaveTypes.id, code: leaveTypes.code, name: leaveTypes.name })
    .from(leaveTypes)
    .where(eq(leaveTypes.isActive, true))
    .orderBy(asc(leaveTypes.code));
  return rows.map((r) => ({ value: String(r.id), label: `${r.name} (${r.code})` }));
}

/** Active employees, optionally limited to some roles. */
export async function employeeOptions(
  roles?: Array<"super_admin" | "office_admin" | "employee" | "technician">,
): Promise<Option[]> {
  const rows = await db
    .select({ id: employees.id, name: employees.name, code: employees.empCode, role: employees.role })
    .from(employees)
    .where(ne(employees.status, "inactive"))
    .orderBy(asc(employees.name));
  return rows
    .filter((r) => !roles || roles.includes(r.role))
    .map((r) => ({ value: String(r.id), label: `${r.name} · ${r.code}` }));
}

export const technicianOptions = () => employeeOptions(["technician"]);

export async function clientOptions(): Promise<Option[]> {
  const rows = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(ne(clients.status, "inactive"))
    .orderBy(asc(clients.name));
  return rows.map((r) => ({ value: String(r.id), label: r.name }));
}

export async function officeLocationOptions(): Promise<Option[]> {
  const rows = await db
    .select({ id: officeLocations.id, name: officeLocations.name })
    .from(officeLocations)
    .where(eq(officeLocations.isActive, true));
  return rows.map((r) => ({ value: String(r.id), label: r.name }));
}

export async function manualTemplateOptions(): Promise<Option[]> {
  const rows = await db
    .select({ id: smsTemplates.id, name: smsTemplates.name })
    .from(smsTemplates)
    .where(and(eq(smsTemplates.isActive, true), eq(smsTemplates.trigger, "manual")))
    .orderBy(asc(smsTemplates.name));
  return rows.map((r) => ({ value: String(r.id), label: r.name }));
}
