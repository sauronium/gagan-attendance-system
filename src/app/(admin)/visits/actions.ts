"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionState, actionError, formToObject, zf } from "@/lib/action";
import { ADMIN_ROLES } from "@/lib/roles";
import { assertViewer } from "@/lib/session";
import { rejectVisit, verifyVisit } from "@/server/visits";

function refresh() {
  revalidatePath("/visits");
  revalidatePath("/dashboard");
}

export async function verifyVisitAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(ADMIN_ROLES);
    await verifyVisit(z.coerce.number().int().positive().parse(fd.get("id")), viewer.employee.id);
    refresh();
    return { ok: true, message: "Visit verified." };
  } catch (e) {
    return actionError(e);
  }
}

export async function rejectVisitAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(ADMIN_ROLES);
    const { id, remark } = z
      .object({ id: zf.id(), remark: zf.text(255) })
      .parse(formToObject(fd));
    await rejectVisit(id, viewer.employee.id, remark);
    refresh();
    return { ok: true, message: "Visit rejected." };
  } catch (e) {
    return actionError(e);
  }
}
