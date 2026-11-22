"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { leaveRequests } from "@/db/schema";
import { type ActionState, actionError, formToObject, zf } from "@/lib/action";
import { logAudit } from "@/lib/audit";
import { assertViewer } from "@/lib/session";
import { createLeaveRequest } from "@/server/leave";

function refresh() {
  revalidatePath("/me/leave");
  revalidatePath("/me");
  revalidatePath("/leave");
}

const applySchema = z
  .object({
    leaveTypeId: zf.id(),
    fromDate: zf.date(),
    toDate: zf.date(),
    halfDay: z.enum(["first_half", "second_half"]).optional(),
    reason: zf.optText(500),
  })
  .refine((d) => d.toDate >= d.fromDate, { path: ["toDate"], message: "End date is before start date." })
  .refine((d) => !d.halfDay || d.fromDate === d.toDate, {
    path: ["halfDay"],
    message: "A half-day must start and end on the same date.",
  });

export async function applyLeaveAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer();
    const data = applySchema.parse(formToObject(fd));
    const { days } = await createLeaveRequest({
      employeeId: viewer.employee.id,
      leaveTypeId: data.leaveTypeId,
      fromDate: data.fromDate,
      toDate: data.toDate,
      halfDay: data.halfDay ?? null,
      reason: data.reason ?? null,
    });
    refresh();
    return {
      ok: true,
      message: `Leave requested · ${days} day${days === 1 ? "" : "s"} counted. Waiting for approval.`,
    };
  } catch (e) {
    return actionError(e);
  }
}

export async function withdrawLeaveAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer();
    const id = zf.id().parse(fd.get("id"));
    const req = await db.query.leaveRequests.findFirst({
      where: and(eq(leaveRequests.id, id), eq(leaveRequests.employeeId, viewer.employee.id)),
      columns: { id: true, status: true },
    });
    if (!req) throw new Error("Leave request not found.");
    if (req.status !== "pending") throw new Error(`This request is already ${req.status}.`);
    await db
      .update(leaveRequests)
      .set({ status: "withdrawn" })
      .where(and(eq(leaveRequests.id, id), eq(leaveRequests.status, "pending")));
    await logAudit({
      actorId: viewer.employee.id,
      tableName: "leave_requests",
      recordId: id,
      action: "update",
      before: { status: "pending" },
      after: { status: "withdrawn" },
    });
    refresh();
    return { ok: true, message: "Leave request withdrawn." };
  } catch (e) {
    return actionError(e);
  }
}
