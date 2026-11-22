"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { attendanceStatuses } from "@/db/schema";
import { type ActionState, actionError, formToObject, zf } from "@/lib/action";
import { attendanceStatus, labelOf } from "@/lib/labels";
import { ADMIN_ROLES } from "@/lib/roles";
import { assertViewer } from "@/lib/session";
import { approveRegularisation, editAttendance, rejectRegularisation } from "@/server/attendance-admin";

function refresh() {
  revalidatePath("/attendance");
  revalidatePath("/attendance/monthly");
  revalidatePath("/dashboard");
  revalidatePath("/employees", "layout");
}

const hhmm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM")
  .optional();

const editSchema = z.object({
  employeeId: zf.id(),
  date: zf.date(),
  status: z.enum(attendanceStatuses).optional(),
  checkIn: hhmm,
  checkOut: hhmm,
  note: zf.optText(255),
  reason: zf.text(255),
});

export async function editAttendanceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(ADMIN_ROLES);
    const input = editSchema.parse(formToObject(fd));
    const { status } = await editAttendance(input, viewer.employee.id);
    refresh();
    return { ok: true, message: `Attendance saved as ${labelOf(attendanceStatus, status).label}.` };
  } catch (e) {
    return actionError(e);
  }
}

export async function approveRegularisationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(ADMIN_ROLES);
    const { status } = await approveRegularisation(z.coerce.number().int().positive().parse(fd.get("id")), viewer.employee.id);
    refresh();
    return { ok: true, message: `Correction approved. Day marked ${labelOf(attendanceStatus, status).label}.` };
  } catch (e) {
    return actionError(e);
  }
}

export async function rejectRegularisationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(ADMIN_ROLES);
    const { id, remark } = z.object({ id: zf.id(), remark: zf.text(255) }).parse(formToObject(fd));
    await rejectRegularisation(id, viewer.employee.id, remark);
    refresh();
    return { ok: true, message: "Correction rejected." };
  } catch (e) {
    return actionError(e);
  }
}
