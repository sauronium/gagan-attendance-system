import "server-only";

import { and, asc, count, desc, eq, gte, like, lte, ne, or, type SQL } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  attendance,
  type EmployeeRole,
  type EmployeeStatus,
  employeeLocations,
  employeeRoles,
  employees,
  employeeStatuses,
  leaveBalanceAdjustments,
  leaveBalances,
  leavePolicyTypes,
  workTypes,
} from "@/db/schema";
import { zf } from "@/lib/action";
import { logAudit } from "@/lib/audit";
import { isValidPhone, normalizePhone } from "@/lib/phone";
import { isAdmin } from "@/lib/roles";
import type { Viewer } from "@/lib/session";
import { monthBounds } from "@/lib/time";
import { createLogin, revokeLogin, setLoginPassword, syncLoginProfile } from "@/server/auth-admin";

// Employee directory and lifecycle: create (with login and opening leave
// balances), edit, status changes and login management.

type Employee = typeof employees.$inferSelect;

// ── Validation ───────────────────────────────────────────────

export const employeeSchema = z.object({
  name: zf.text(120),
  empCode: zf.text(20).regex(/^[A-Za-z0-9._-]+$/, "Letters, numbers, dot, dash or underscore only"),
  mobile: z
    .string({ error: "Required" })
    .trim()
    .min(1, "Required")
    .transform(normalizePhone)
    .refine(isValidPhone, "Enter a valid mobile number"),
  email: z.email("Enter a valid email").max(191).optional(),
  role: z.enum(employeeRoles, { error: "Pick a role" }),
  departmentId: zf.optId(),
  designation: zf.optText(100),
  shiftId: zf.optId(),
  managerId: zf.optId(),
  leavePolicyId: zf.optId(),
  workType: z.enum(workTypes, { error: "Pick a work type" }),
  joinedOn: zf.optDate(),
});
export type EmployeeInput = z.infer<typeof employeeSchema>;

export const passwordSchema = z.string({ error: "Required" }).min(8, "At least 8 characters").max(128);

// ── Permissions ──────────────────────────────────────────────

/**
 * Only a Super Admin may create admins, promote to an admin role, or change
 * anything about an existing admin (including their password).
 */
function assertCanManage(viewer: Viewer, target: { role: EmployeeRole } | null, newRole?: EmployeeRole) {
  if (viewer.employee.role === "super_admin") return;
  if (newRole && isAdmin(newRole)) {
    throw new Error("Only a Super Admin can give someone an admin role.");
  }
  if (target && isAdmin(target.role)) {
    throw new Error("Only a Super Admin can change an admin's account.");
  }
}

export function canManage(viewer: Viewer, target: { role: EmployeeRole }) {
  return viewer.employee.role === "super_admin" || !isAdmin(target.role);
}

// ── Queries ──────────────────────────────────────────────────

export type EmployeeFilters = {
  q?: string;
  departmentId?: number;
  role?: EmployeeRole;
  /** "" = current staff (not inactive), "all" = everyone. */
  status?: EmployeeStatus | "all" | "";
};

export async function listEmployees(f: EmployeeFilters) {
  const where: SQL[] = [];
  const q = f.q?.trim();
  if (q) {
    const pattern = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
    const digits = q.replace(/\D/g, "");
    where.push(
      or(
        like(employees.name, pattern),
        like(employees.empCode, pattern),
        ...(digits.length >= 3 ? [like(employees.mobile, `%${digits}%`)] : []),
      )!,
    );
  }
  if (f.departmentId) where.push(eq(employees.departmentId, f.departmentId));
  if (f.role) where.push(eq(employees.role, f.role));
  if (f.status && f.status !== "all") where.push(eq(employees.status, f.status));
  else if (!f.status) where.push(ne(employees.status, "inactive"));

  return db.query.employees.findMany({
    where: where.length ? and(...where) : undefined,
    orderBy: asc(employees.name),
    columns: {
      id: true,
      name: true,
      empCode: true,
      designation: true,
      role: true,
      mobile: true,
      workType: true,
      status: true,
      userId: true,
    },
    with: {
      department: { columns: { name: true } },
      shift: { columns: { name: true } },
    },
  });
}

export async function getEmployee(id: number) {
  return db.query.employees.findFirst({
    where: eq(employees.id, id),
    with: {
      department: { columns: { name: true } },
      shift: { columns: { name: true } },
      manager: { columns: { id: true, name: true } },
      leavePolicy: { columns: { name: true } },
      locations: { columns: { locationId: true } },
    },
  });
}

/** Days per status in a month, plus the most recent days on record. */
export async function getEmployeeAttendanceSummary(employeeId: number, month: string) {
  const { from, to } = monthBounds(month);
  const [byStatus, recent] = await Promise.all([
    db
      .select({ status: attendance.status, n: count() })
      .from(attendance)
      .where(and(eq(attendance.employeeId, employeeId), gte(attendance.date, from), lte(attendance.date, to)))
      .groupBy(attendance.status),
    db
      .select({
        date: attendance.date,
        status: attendance.status,
        checkInAt: attendance.checkInAt,
        checkOutAt: attendance.checkOutAt,
        workedMinutes: attendance.workedMinutes,
        flags: attendance.flags,
      })
      .from(attendance)
      .where(eq(attendance.employeeId, employeeId))
      .orderBy(desc(attendance.date))
      .limit(10),
  ]);
  return { byStatus, recent };
}

// ── Leave balances on joining ────────────────────────────────

const floorHalf = (n: number) => Math.floor(n * 2) / 2;

/**
 * This year's balances from the policy: yearly types get the full quota,
 * monthly types get quota/12 for each month left (current month included).
 */
async function creditOpeningBalances(
  employeeId: number,
  policyId: number,
  today: string,
  actorId: number,
) {
  const types = await db.select().from(leavePolicyTypes).where(eq(leavePolicyTypes.policyId, policyId));
  if (!types.length) return;
  const year = Number(today.slice(0, 4));
  const monthsLeft = 12 - Number(today.slice(5, 7)) + 1;

  for (const t of types) {
    const credited =
      t.accrual === "yearly"
        ? t.yearlyQuota
        : t.accrual === "monthly"
          ? floorHalf((t.yearlyQuota / 12) * monthsLeft)
          : 0;
    await db
      .insert(leaveBalances)
      .values({ employeeId, leaveTypeId: t.leaveTypeId, year, credited })
      .onDuplicateKeyUpdate({ set: { credited } });
    if (credited > 0) {
      await db.insert(leaveBalanceAdjustments).values({
        employeeId,
        leaveTypeId: t.leaveTypeId,
        year,
        kind: "accrual",
        days: credited,
        reason: t.accrual === "monthly" ? `Opening credit for ${monthsLeft} month(s)` : "Opening credit for the year",
        createdBy: actorId,
      });
    }
  }
}

// ── Mutations ────────────────────────────────────────────────

function employeeValues(input: EmployeeInput) {
  return {
    name: input.name,
    empCode: input.empCode,
    mobile: input.mobile,
    email: input.email ?? null,
    role: input.role,
    departmentId: input.departmentId ?? null,
    designation: input.designation ?? null,
    shiftId: input.shiftId ?? null,
    managerId: input.managerId ?? null,
    leavePolicyId: input.leavePolicyId ?? null,
    workType: input.workType,
    joinedOn: input.joinedOn ?? null,
  };
}

async function assertUnique(input: EmployeeInput, exceptId?: number) {
  const clash = await db.query.employees.findFirst({
    where: and(
      or(eq(employees.empCode, input.empCode), eq(employees.mobile, input.mobile)),
      exceptId ? ne(employees.id, exceptId) : undefined,
    ),
    columns: { empCode: true, mobile: true },
  });
  if (clash?.empCode.toLowerCase() === input.empCode.toLowerCase()) {
    throw new Error(`Employee code ${input.empCode} is already used.`);
  }
  if (clash) throw new Error("Another employee already has this mobile number.");
}

export async function createEmployee(
  input: EmployeeInput,
  locationIds: number[],
  password: string,
  viewer: Viewer,
  today: string,
): Promise<number> {
  assertCanManage(viewer, null, input.role);
  await assertUnique(input);

  const values = employeeValues(input);
  const id = await db.transaction(async (tx) => {
    const [row] = await tx.insert(employees).values(values).$returningId();
    if (locationIds.length) {
      await tx.insert(employeeLocations).values(locationIds.map((locationId) => ({ employeeId: row.id, locationId })));
    }
    return row.id;
  });

  let userId: string;
  try {
    userId = await createLogin({
      name: input.name,
      phone: input.mobile,
      email: input.email,
      empCode: input.empCode,
      password,
    });
  } catch (e) {
    // Undo the employee so the admin can fix the problem and try again.
    await db.delete(employees).where(eq(employees.id, id));
    throw e;
  }
  await db.update(employees).set({ userId }).where(eq(employees.id, id));

  if (input.leavePolicyId) {
    await creditOpeningBalances(id, input.leavePolicyId, today, viewer.employee.id);
  }
  await logAudit({
    actorId: viewer.employee.id,
    tableName: "employees",
    recordId: id,
    action: "create",
    after: { ...values, locationIds, login: true },
  });
  return id;
}

function auditable(e: Employee) {
  return {
    name: e.name,
    empCode: e.empCode,
    mobile: e.mobile,
    email: e.email,
    role: e.role,
    departmentId: e.departmentId,
    designation: e.designation,
    shiftId: e.shiftId,
    managerId: e.managerId,
    leavePolicyId: e.leavePolicyId,
    workType: e.workType,
    joinedOn: e.joinedOn,
  };
}

async function loadForChange(id: number, viewer: Viewer, newRole?: EmployeeRole) {
  const existing = await db.query.employees.findFirst({ where: eq(employees.id, id) });
  if (!existing) throw new Error("Employee not found.");
  assertCanManage(viewer, existing, newRole);
  return existing;
}

export async function updateEmployee(id: number, input: EmployeeInput, locationIds: number[], viewer: Viewer) {
  const existing = await loadForChange(id, viewer, input.role);
  if (id === viewer.employee.id && input.role !== existing.role) {
    throw new Error("You can't change your own role.");
  }
  if (input.managerId === id) throw new Error("An employee can't be their own manager.");
  await assertUnique(input, id);

  const values = employeeValues(input);
  const before = await db
    .select({ locationId: employeeLocations.locationId })
    .from(employeeLocations)
    .where(eq(employeeLocations.employeeId, id));

  await db.transaction(async (tx) => {
    await tx.update(employees).set(values).where(eq(employees.id, id));
    await tx.delete(employeeLocations).where(eq(employeeLocations.employeeId, id));
    if (locationIds.length) {
      await tx.insert(employeeLocations).values(locationIds.map((locationId) => ({ employeeId: id, locationId })));
    }
  });

  if (existing.userId) {
    await syncLoginProfile(existing.userId, {
      name: input.name,
      phone: input.mobile,
      email: input.email,
      empCode: input.empCode,
    });
  }
  await logAudit({
    actorId: viewer.employee.id,
    tableName: "employees",
    recordId: id,
    action: "update",
    before: { ...auditable(existing), locationIds: before.map((b) => b.locationId) },
    after: { ...values, locationIds },
  });
}

export async function changeEmployeeStatus(
  id: number,
  input: { status: EmployeeStatus; leftOn?: string; reason?: string },
  viewer: Viewer,
) {
  const existing = await loadForChange(id, viewer);
  if (id === viewer.employee.id) throw new Error("You can't change your own status.");
  if (!employeeStatuses.includes(input.status)) throw new Error("Unknown status.");
  if (input.status === "inactive" && !input.leftOn) throw new Error("Enter the last working day.");

  const leftOn = input.status === "active" ? null : (input.leftOn ?? null);
  await db.update(employees).set({ status: input.status, leftOn }).where(eq(employees.id, id));
  if (input.status === "inactive" && existing.userId) {
    await revokeLogin(existing.userId);
  }
  await logAudit({
    actorId: viewer.employee.id,
    tableName: "employees",
    recordId: id,
    action: "update",
    before: { status: existing.status, leftOn: existing.leftOn },
    after: { status: input.status, leftOn },
    reason: input.reason ?? null,
  });
}

export async function resetEmployeePassword(id: number, password: string, viewer: Viewer) {
  const existing = await loadForChange(id, viewer);
  if (!existing.userId) throw new Error("This employee has no login yet.");
  await setLoginPassword(existing.userId, password);
  await logAudit({
    actorId: viewer.employee.id,
    tableName: "employees",
    recordId: id,
    action: "update",
    after: { passwordReset: true },
  });
}

export async function createEmployeeLogin(id: number, password: string, viewer: Viewer) {
  const existing = await loadForChange(id, viewer);
  if (existing.userId) throw new Error("This employee already has a login.");
  if (existing.status === "inactive") throw new Error("Reactivate the employee before creating a login.");
  const userId = await createLogin({
    name: existing.name,
    phone: existing.mobile,
    email: existing.email,
    empCode: existing.empCode,
    password,
  });
  await db.update(employees).set({ userId }).where(eq(employees.id, id));
  await logAudit({
    actorId: viewer.employee.id,
    tableName: "employees",
    recordId: id,
    action: "update",
    before: { login: false },
    after: { login: true },
  });
}
