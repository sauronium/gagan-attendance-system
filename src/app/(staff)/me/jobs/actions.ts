"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionState, actionError, formToObject, zf } from "@/lib/action";
import { assertViewer } from "@/lib/session";
import { formatDate } from "@/lib/time";
import { completeServiceVisit } from "@/server/staff";

const schema = z.object({
  id: zf.id(),
  notes: zf.optText(2000),
  parts: zf.optText(1000),
  nextDueOn: zf.optDate(),
  photo: z.string().max(3_000_000).optional(),
});

export async function completeJobAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(["technician"]);
    const d = schema.parse(formToObject(fd));
    const res = await completeServiceVisit(viewer.employee.id, {
      id: d.id,
      notes: d.notes,
      partsText: d.parts,
      photoDataUrl: d.photo,
      nextDueOn: d.nextDueOn,
    });
    revalidatePath("/me/jobs");
    revalidatePath("/me");
    const parts = [
      res.complaintResolved ? "Job done and complaint resolved." : "Job marked done.",
      res.nextDueOn ? `Next service ${formatDate(res.nextDueOn)}.` : "",
      res.smsSent ? "Client notified by SMS." : "",
    ];
    return { ok: true, message: parts.filter(Boolean).join(" ") };
  } catch (e) {
    return actionError(e);
  }
}
