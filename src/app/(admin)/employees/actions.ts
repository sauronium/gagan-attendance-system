"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { employeeStatuses } from "@/db/schema";
import { type ActionState, actionError, formToObject, zf } from "@/lib/action";
import { env } from "@/lib/env";
import { ADMIN_ROLES } from "@/lib/roles";
import { assertViewer } from "@/lib/session";
import { todayIso } from "@/lib/time";
import {
  changeEmployeeStatus,
  createEmployee,
  createEmployeeLogin,
  employeeSchema,
  passwordSchema,
  resetEmployeePassword,
  updateEmployee,
} from "@/server/employees";

function refresh(id?: number) {
  revalidatePath("/employees");
  if (id) revalidatePath(`/employees/${id}`);
  revalidatePath("/dashboard");
}

function locationIds(fd: FormData): number[] {
  return [...new Set(fd.getAll("locationIds").map(Number).filter((n) => Number.isInteger(n) && n > 0))];
}

/** Password exactly as typed (not trimmed); issues are reported on the "password" field. */
function parsePassword(fd: FormData) {
  const raw = fd.get("password");
  const parsed = passwordSchema.safeParse(typeof raw === "string" && raw !== "" ? raw : undefined);
  return parsed.success
    ? { data: parsed.data, issues: [] }
    : { data: "", issues: parsed.error.issues.map((i) => ({ ...i, path: ["password"] })) };
}

function password(fd: FormData) {
  const { data, issues } = parsePassword(fd);
  if (issues.length) throw new z.ZodError(issues);
  return data;
}

export async function createEmployeeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: number;
  try {
    const viewer = await assertViewer(ADMIN_ROLES);
    const parsed = employeeSchema.safeParse(formToObject(fd));
    const pw = parsePassword(fd);
    if (!parsed.success || pw.issues.length) {
      throw new z.ZodError([...(parsed.error?.issues ?? []), ...pw.issues]);
    }
    id = await createEmployee(parsed.data, locationIds(fd), pw.data, viewer, todayIso(env.timezone));
    refresh();
  } catch (e) {
    return actionError(e);
  }
  redirect(`/employees/${id}`);
}

export async function updateEmployeeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(ADMIN_ROLES);
    const id = zf.id().parse(fd.get("id"));
    const input = employeeSchema.parse(formToObject(fd));
    await updateEmployee(id, input, locationIds(fd), viewer);
    refresh(id);
    return { ok: true, message: "Employee details saved." };
  } catch (e) {
    return actionError(e);
  }
}

export async function changeStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(ADMIN_ROLES);
    const data = z
      .object({
        id: zf.id(),
        status: z.enum(employeeStatuses, { error: "Pick a status" }),
        leftOn: zf.optDate(),
        remark: zf.optText(255),
      })
      .parse(formToObject(fd));
    // Marking someone inactive without a date means they left today.
    const leftOn = data.leftOn ?? (data.status === "inactive" ? todayIso(env.timezone) : undefined);
    await changeEmployeeStatus(data.id, { status: data.status, leftOn, reason: data.remark }, viewer);
    refresh(data.id);
    return {
      ok: true,
      message: data.status === "inactive" ? "Employee deactivated and signed out." : "Status updated.",
    };
  } catch (e) {
    return actionError(e);
  }
}

export async function resetPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(ADMIN_ROLES);
    const id = zf.id().parse(fd.get("id"));
    await resetEmployeePassword(id, password(fd), viewer);
    return { ok: true, message: "Password changed. The employee was signed out everywhere." };
  } catch (e) {
    return actionError(e);
  }
}

export async function createLoginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(ADMIN_ROLES);
    const id = zf.id().parse(fd.get("id"));
    await createEmployeeLogin(id, password(fd), viewer);
    refresh(id);
    return { ok: true, message: "Login created. The employee can sign in with their mobile number." };
  } catch (e) {
    return actionError(e);
  }
}
