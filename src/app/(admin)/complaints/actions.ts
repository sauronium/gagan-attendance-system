"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { complaintPriorities } from "@/db/schema";
import { type ActionState, actionError, formToObject, zf } from "@/lib/action";
import { env } from "@/lib/env";
import { ADMIN_ROLES } from "@/lib/roles";
import { assertViewer } from "@/lib/session";
import { timeToMinutes, zonedMidnight } from "@/lib/time";
import { assignComplaint, closeComplaint, createComplaint, resolveComplaint, startComplaint } from "@/server/amc";

function refresh() {
  revalidatePath("/complaints");
  revalidatePath("/clients", "layout");
  revalidatePath("/amc");
  revalidatePath("/dashboard");
}

/** "YYYY-MM-DDTHH:mm" typed in the business timezone → instant. */
function localDateTime(value: string): Date {
  const [day, time] = value.split("T");
  return new Date(zonedMidnight(day, env.timezone).getTime() + timeToMinutes(time) * 60_000);
}

export async function createComplaintAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(ADMIN_ROLES);
    const d = z
      .object({
        installationId: zf.id(),
        priority: z.enum(complaintPriorities),
        issue: zf.text(2000),
        dueBy: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "Pick a date and time")
          .optional(),
      })
      .parse(formToObject(fd));
    const res = await createComplaint(
      { installationId: d.installationId, priority: d.priority, issue: d.issue, dueBy: d.dueBy ? localDateTime(d.dueBy) : null },
      viewer.employee.id,
    );
    refresh();
    return { ok: true, message: `Complaint ${res.ticketNo} logged. Ticket number sent to the client.` };
  } catch (e) {
    return actionError(e);
  }
}

export async function assignComplaintAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(ADMIN_ROLES);
    const d = z
      .object({ id: zf.id(), technicianId: z.coerce.number({ error: "Pick a technician" }).int().positive("Pick a technician") })
      .parse(formToObject(fd));
    const res = await assignComplaint(d.id, d.technicianId, viewer.employee.id);
    refresh();
    return { ok: true, message: `${res.ticketNo} assigned to ${res.technician}. Visit scheduled for today.` };
  } catch (e) {
    return actionError(e);
  }
}

export async function startComplaintAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(ADMIN_ROLES);
    const ticket = await startComplaint(zf.id().parse(fd.get("id")), viewer.employee.id);
    refresh();
    return { ok: true, message: `${ticket} is in progress.` };
  } catch (e) {
    return actionError(e);
  }
}

export async function resolveComplaintAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(ADMIN_ROLES);
    const d = z.object({ id: zf.id(), resolutionNotes: zf.text(2000) }).parse(formToObject(fd));
    const ticket = await resolveComplaint(d.id, d.resolutionNotes, viewer.employee.id);
    refresh();
    return { ok: true, message: `${ticket} resolved. Client notified.` };
  } catch (e) {
    return actionError(e);
  }
}

export async function closeComplaintAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(ADMIN_ROLES);
    const d = z.object({ id: zf.id(), remark: zf.optText(255) }).parse(formToObject(fd));
    const ticket = await closeComplaint(d.id, viewer.employee.id, d.remark);
    refresh();
    return { ok: true, message: `${ticket} closed.` };
  } catch (e) {
    return actionError(e);
  }
}
