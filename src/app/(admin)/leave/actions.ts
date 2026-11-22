"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { holidays } from "@/db/schema";
import { type ActionState, actionError, formToObject, zf } from "@/lib/action";
import { logAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { ADMIN_ROLES } from "@/lib/roles";
import { assertViewer } from "@/lib/session";
import { todayIso } from "@/lib/time";
import { approveLeaveRequest, cancelApprovedLeave, rejectLeaveRequest } from "@/server/leave";

function refresh() {
  revalidatePath("/leave");
  revalidatePath("/dashboard");
  revalidatePath("/attendance");
}

export async function approveLeaveAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(ADMIN_ROLES);
    await approveLeaveRequest(z.coerce.number().parse(fd.get("id")), viewer.employee.id);
    refresh();
    return { ok: true, message: "Leave approved. Balance and roster updated." };
  } catch (e) {
    return actionError(e);
  }
}

export async function rejectLeaveAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(ADMIN_ROLES);
    const { id, remark } = z
      .object({ id: zf.id(), remark: zf.text(255) })
      .parse(formToObject(fd));
    await rejectLeaveRequest(id, viewer.employee.id, remark);
    refresh();
    return { ok: true, message: "Leave rejected." };
  } catch (e) {
    return actionError(e);
  }
}

export async function cancelLeaveAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(ADMIN_ROLES);
    const { id, remark } = z
      .object({ id: zf.id(), remark: zf.optText(255) })
      .parse(formToObject(fd));
    await cancelApprovedLeave(id, viewer.employee.id, todayIso(env.timezone), remark);
    refresh();
    return { ok: true, message: "Leave cancelled and balance restored." };
  } catch (e) {
    return actionError(e);
  }
}

export async function addHolidayAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(ADMIN_ROLES);
    const data = z
      .object({ date: zf.date(), name: zf.text(100), isOptional: zf.bool() })
      .parse(formToObject(fd));
    const [row] = await db.insert(holidays).values(data).$returningId();
    await logAudit({ actorId: viewer.employee.id, tableName: "holidays", recordId: row.id, action: "create", after: data });
    revalidatePath("/leave");
    return { ok: true, message: `Holiday "${data.name}" added.` };
  } catch (e) {
    return actionError(e);
  }
}

export async function deleteHolidayAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(ADMIN_ROLES);
    const id = z.coerce.number().parse(fd.get("id"));
    await db.delete(holidays).where(eq(holidays.id, id));
    await logAudit({ actorId: viewer.employee.id, tableName: "holidays", recordId: id, action: "delete" });
    revalidatePath("/leave");
    return { ok: true, message: "Holiday removed." };
  } catch (e) {
    return actionError(e);
  }
}
