"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import {
  accrualModes,
  departments,
  leavePolicies,
  leavePolicyTypes,
  leaveTypes,
  officeLocations,
  shifts,
} from "@/db/schema";
import { type ActionState, actionError, formToObject, zf } from "@/lib/action";
import { logAudit } from "@/lib/audit";
import { assertViewer } from "@/lib/session";

// Settings are Super Admin only. Each action validates, writes, audits and
// revalidates /settings (plus screens that read the changed lists).

const SUPER = ["super_admin"] as const;

function refresh() {
  revalidatePath("/settings");
  revalidatePath("/employees");
  revalidatePath("/leave");
}

const time = () => z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Pick a time");
/** "09:30" → "09:30:00" for MySQL TIME. */
const toTime = (v: string) => (v.length === 5 ? `${v}:00` : v);
/** Optional whole number from a form field (blank → undefined). */
const optInt = (max: number) => z.coerce.number().int().min(0).max(max).optional();

/** Generic "flip isActive" for the tables that have one. */
const toggleSchema = z.object({ id: zf.id(), active: zf.bool() });

// ── Shifts ───────────────────────────────────────────────────

const shiftSchema = z.object({
  id: zf.optId(),
  name: zf.text(100),
  startTime: time(),
  endTime: time(),
  crossesMidnight: zf.bool(),
  breakMinutes: zf.int(0).max(600),
  graceMinutes: zf.int(0).max(600),
  halfDayAfter: time().optional(),
  halfDayBelowMinutes: zf.int(0).max(1440),
  absentBelowMinutes: zf.int(0).max(1440),
  overtimeAfterMinutes: zf.int(0).max(1440),
  latesPerHalfDay: zf.int(0).max(31),
});

export async function saveShiftAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(SUPER);
    const { id, ...d } = shiftSchema.parse(formToObject(fd));
    // Weekday checkboxes share one name, so read them with getAll().
    const weeklyOffs = [...new Set(fd.getAll("weeklyOffs").map(Number))]
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
      .sort();
    if (d.absentBelowMinutes > d.halfDayBelowMinutes) {
      return {
        ok: false,
        error: "Please fix the highlighted fields.",
        fieldErrors: { absentBelowMinutes: "Must not be more than the half-day threshold." },
      };
    }
    const values = {
      ...d,
      startTime: toTime(d.startTime),
      endTime: toTime(d.endTime),
      halfDayAfter: d.halfDayAfter ? toTime(d.halfDayAfter) : null,
      weeklyOffs,
    };
    if (id) {
      const before = await db.query.shifts.findFirst({ where: eq(shifts.id, id) });
      if (!before) throw new Error("Shift not found.");
      await db.update(shifts).set(values).where(eq(shifts.id, id));
      await logAudit({ actorId: viewer.employee.id, tableName: "shifts", recordId: id, action: "update", before, after: values });
    } else {
      const [row] = await db.insert(shifts).values(values).$returningId();
      await logAudit({ actorId: viewer.employee.id, tableName: "shifts", recordId: row.id, action: "create", after: values });
    }
    refresh();
    return { ok: true, message: id ? `Shift "${d.name}" saved.` : `Shift "${d.name}" added.` };
  } catch (e) {
    return actionError(e);
  }
}

export async function toggleShiftAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(SUPER);
    const { id, active } = toggleSchema.parse(formToObject(fd));
    await db.update(shifts).set({ isActive: active }).where(eq(shifts.id, id));
    await logAudit({ actorId: viewer.employee.id, tableName: "shifts", recordId: id, action: "update", after: { isActive: active } });
    refresh();
    return { ok: true, message: active ? "Shift activated." : "Shift deactivated." };
  } catch (e) {
    return actionError(e);
  }
}

// ── Office locations ─────────────────────────────────────────

const locationSchema = z.object({
  id: zf.optId(),
  name: zf.text(100),
  address: zf.optText(255),
  lat: z.coerce.number().min(-90, "Latitude is −90 to 90").max(90, "Latitude is −90 to 90"),
  lng: z.coerce.number().min(-180, "Longitude is −180 to 180").max(180, "Longitude is −180 to 180"),
  radiusM: zf.int(10).max(5000),
});

export async function saveLocationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(SUPER);
    const { id, ...d } = locationSchema.parse(formToObject(fd));
    const values = { ...d, address: d.address ?? null };
    if (id) {
      const before = await db.query.officeLocations.findFirst({ where: eq(officeLocations.id, id) });
      if (!before) throw new Error("Location not found.");
      await db.update(officeLocations).set(values).where(eq(officeLocations.id, id));
      await logAudit({ actorId: viewer.employee.id, tableName: "office_locations", recordId: id, action: "update", before, after: values });
    } else {
      const [row] = await db.insert(officeLocations).values(values).$returningId();
      await logAudit({ actorId: viewer.employee.id, tableName: "office_locations", recordId: row.id, action: "create", after: values });
    }
    refresh();
    return { ok: true, message: id ? `Location "${d.name}" saved.` : `Location "${d.name}" added.` };
  } catch (e) {
    return actionError(e);
  }
}

export async function toggleLocationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(SUPER);
    const { id, active } = toggleSchema.parse(formToObject(fd));
    await db.update(officeLocations).set({ isActive: active }).where(eq(officeLocations.id, id));
    await logAudit({ actorId: viewer.employee.id, tableName: "office_locations", recordId: id, action: "update", after: { isActive: active } });
    refresh();
    return { ok: true, message: active ? "Location activated." : "Location deactivated." };
  } catch (e) {
    return actionError(e);
  }
}

// ── Departments ──────────────────────────────────────────────

const departmentSchema = z.object({
  id: zf.optId(),
  name: zf.text(100),
  headEmployeeId: zf.optId(),
});

export async function saveDepartmentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(SUPER);
    const { id, ...d } = departmentSchema.parse(formToObject(fd));
    const values = { name: d.name, headEmployeeId: d.headEmployeeId ?? null };
    if (id) {
      const before = await db.query.departments.findFirst({ where: eq(departments.id, id) });
      if (!before) throw new Error("Department not found.");
      await db.update(departments).set(values).where(eq(departments.id, id));
      await logAudit({ actorId: viewer.employee.id, tableName: "departments", recordId: id, action: "update", before, after: values });
    } else {
      const [row] = await db.insert(departments).values(values).$returningId();
      await logAudit({ actorId: viewer.employee.id, tableName: "departments", recordId: row.id, action: "create", after: values });
    }
    refresh();
    return { ok: true, message: id ? `Department "${d.name}" saved.` : `Department "${d.name}" added.` };
  } catch (e) {
    return actionError(e);
  }
}

export async function toggleDepartmentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(SUPER);
    const { id, active } = toggleSchema.parse(formToObject(fd));
    await db.update(departments).set({ isActive: active }).where(eq(departments.id, id));
    await logAudit({ actorId: viewer.employee.id, tableName: "departments", recordId: id, action: "update", after: { isActive: active } });
    refresh();
    return { ok: true, message: active ? "Department activated." : "Department deactivated." };
  } catch (e) {
    return actionError(e);
  }
}

// ── Leave types ──────────────────────────────────────────────

const leaveTypeSchema = z.object({
  id: zf.optId(),
  code: z
    .string()
    .trim()
    .min(1, "Required")
    .max(10)
    .regex(/^[A-Za-z0-9_-]+$/, "Letters and numbers only")
    .transform((v) => v.toUpperCase()),
  name: zf.text(60),
  isPaid: zf.bool(),
});

export async function saveLeaveTypeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(SUPER);
    const { id, ...d } = leaveTypeSchema.parse(formToObject(fd));
    if (id) {
      const before = await db.query.leaveTypes.findFirst({ where: eq(leaveTypes.id, id) });
      if (!before) throw new Error("Leave type not found.");
      await db.update(leaveTypes).set(d).where(eq(leaveTypes.id, id));
      await logAudit({ actorId: viewer.employee.id, tableName: "leave_types", recordId: id, action: "update", before, after: d });
    } else {
      const [row] = await db.insert(leaveTypes).values(d).$returningId();
      await logAudit({ actorId: viewer.employee.id, tableName: "leave_types", recordId: row.id, action: "create", after: d });
    }
    refresh();
    return { ok: true, message: id ? `Leave type ${d.code} saved.` : `Leave type ${d.code} added.` };
  } catch (e) {
    return actionError(e);
  }
}

export async function toggleLeaveTypeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(SUPER);
    const { id, active } = toggleSchema.parse(formToObject(fd));
    await db.update(leaveTypes).set({ isActive: active }).where(eq(leaveTypes.id, id));
    await logAudit({ actorId: viewer.employee.id, tableName: "leave_types", recordId: id, action: "update", after: { isActive: active } });
    refresh();
    return { ok: true, message: active ? "Leave type activated." : "Leave type deactivated." };
  } catch (e) {
    return actionError(e);
  }
}

// ── Leave policies ───────────────────────────────────────────

export async function savePolicyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(SUPER);
    const { id, name } = z.object({ id: zf.optId(), name: zf.text(100) }).parse(formToObject(fd));
    if (id) {
      await db.update(leavePolicies).set({ name }).where(eq(leavePolicies.id, id));
      await logAudit({ actorId: viewer.employee.id, tableName: "leave_policies", recordId: id, action: "update", after: { name } });
    } else {
      const [row] = await db.insert(leavePolicies).values({ name }).$returningId();
      await logAudit({ actorId: viewer.employee.id, tableName: "leave_policies", recordId: row.id, action: "create", after: { name } });
    }
    refresh();
    return { ok: true, message: id ? `Policy renamed to "${name}".` : `Policy "${name}" added. Now set its leave quotas.` };
  } catch (e) {
    return actionError(e);
  }
}

export async function togglePolicyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(SUPER);
    const { id, active } = toggleSchema.parse(formToObject(fd));
    await db.update(leavePolicies).set({ isActive: active }).where(eq(leavePolicies.id, id));
    await logAudit({ actorId: viewer.employee.id, tableName: "leave_policies", recordId: id, action: "update", after: { isActive: active } });
    refresh();
    return { ok: true, message: active ? "Policy activated." : "Policy deactivated." };
  } catch (e) {
    return actionError(e);
  }
}

const policyTypeSchema = z.object({
  policyId: zf.id(),
  leaveTypeId: zf.id(),
  yearlyQuota: z.coerce.number().min(0).max(366),
  accrual: z.enum(accrualModes),
  carryForwardMax: z.coerce.number().min(0).max(366),
  minNoticeDays: zf.int(0).max(255),
  maxContinuousDays: optInt(255),
  documentAfterDays: optInt(255),
  expiresAfterDays: optInt(65535),
});

/** Adds a leave type to a policy, or updates its rules if already there. */
export async function savePolicyTypeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(SUPER);
    const d = policyTypeSchema.parse(formToObject(fd));
    const values = {
      ...d,
      maxContinuousDays: d.maxContinuousDays ?? null,
      documentAfterDays: d.documentAfterDays ?? null,
      expiresAfterDays: d.expiresAfterDays ?? null,
    };
    const { policyId, leaveTypeId, ...rules } = values;
    const before = await db.query.leavePolicyTypes.findFirst({
      where: and(eq(leavePolicyTypes.policyId, policyId), eq(leavePolicyTypes.leaveTypeId, leaveTypeId)),
    });
    await db.insert(leavePolicyTypes).values(values).onDuplicateKeyUpdate({ set: rules });
    // The row has a composite key; the audit record points at the policy.
    await logAudit({
      actorId: viewer.employee.id,
      tableName: "leave_policy_types",
      recordId: policyId,
      action: before ? "update" : "create",
      before: before ?? null,
      after: values,
    });
    refresh();
    return { ok: true, message: before ? "Leave rules updated." : "Leave type added to the policy." };
  } catch (e) {
    return actionError(e);
  }
}

export async function removePolicyTypeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(SUPER);
    const { policyId, leaveTypeId } = z.object({ policyId: zf.id(), leaveTypeId: zf.id() }).parse(formToObject(fd));
    const before = await db.query.leavePolicyTypes.findFirst({
      where: and(eq(leavePolicyTypes.policyId, policyId), eq(leavePolicyTypes.leaveTypeId, leaveTypeId)),
    });
    await db
      .delete(leavePolicyTypes)
      .where(and(eq(leavePolicyTypes.policyId, policyId), eq(leavePolicyTypes.leaveTypeId, leaveTypeId)));
    await logAudit({
      actorId: viewer.employee.id,
      tableName: "leave_policy_types",
      recordId: policyId,
      action: "delete",
      before: before ?? null,
    });
    refresh();
    return { ok: true, message: "Leave type removed from the policy." };
  } catch (e) {
    return actionError(e);
  }
}
