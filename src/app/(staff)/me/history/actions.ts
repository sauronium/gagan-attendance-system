"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { attendance, regularisations, regularisationTypes } from "@/db/schema";
import { type ActionState, actionError, formToObject, zf } from "@/lib/action";
import { env } from "@/lib/env";
import { assertViewer } from "@/lib/session";
import { addDays, timeToMinutes, todayIso, zonedMidnight } from "@/lib/time";

const hhmm = () =>
  z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM")
    .optional();

const schema = z
  .object({
    date: zf.date(),
    type: z.enum(regularisationTypes, { message: "Pick a request type" }),
    checkIn: hhmm(),
    checkOut: hhmm(),
    reason: zf.text(500),
  })
  .superRefine((d, ctx) => {
    if ((d.type === "missed_check_in" || d.type === "on_duty") && !d.checkIn) {
      ctx.addIssue({ code: "custom", path: ["checkIn"], message: "Enter the check-in time." });
    }
    if ((d.type === "missed_check_out" || d.type === "on_duty") && !d.checkOut) {
      ctx.addIssue({ code: "custom", path: ["checkOut"], message: "Enter the check-out time." });
    }
    if (d.checkIn && d.checkOut && timeToMinutes(d.checkOut) <= timeToMinutes(d.checkIn)) {
      ctx.addIssue({ code: "custom", path: ["checkOut"], message: "Check-out must be after check-in." });
    }
  });

export async function requestCorrectionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer();
    const d = schema.parse(formToObject(fd));
    const tz = env.timezone;
    const today = todayIso(tz);
    if (d.date > today) throw new Error("You can't request a correction for a future date.");
    if (d.date < addDays(today, -60)) throw new Error("Corrections can only be requested for the last 60 days.");

    const employeeId = viewer.employee.id;
    const duplicate = await db.query.regularisations.findFirst({
      where: and(
        eq(regularisations.employeeId, employeeId),
        eq(regularisations.date, d.date),
        eq(regularisations.type, d.type),
        eq(regularisations.status, "pending"),
      ),
      columns: { id: true },
    });
    if (duplicate) throw new Error("You already have a pending request of this type for that day.");

    const row = await db.query.attendance.findFirst({
      where: and(eq(attendance.employeeId, employeeId), eq(attendance.date, d.date)),
      columns: { id: true },
    });

    const midnight = zonedMidnight(d.date, tz).getTime();
    const at = (t?: string) => (t ? new Date(midnight + timeToMinutes(t) * 60_000) : null);

    await db.insert(regularisations).values({
      employeeId,
      date: d.date,
      attendanceId: row?.id ?? null,
      type: d.type,
      requestedCheckInAt: at(d.checkIn),
      requestedCheckOutAt: at(d.checkOut),
      reason: d.reason,
    });
    revalidatePath("/me/history");
    return { ok: true, message: "Correction request sent for approval." };
  } catch (e) {
    return actionError(e);
  }
}
