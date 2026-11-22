"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionState, actionError, formToObject } from "@/lib/action";
import { env } from "@/lib/env";
import { labelOf, attendanceStatus } from "@/lib/labels";
import { assertViewer } from "@/lib/session";
import { formatDuration, formatTime } from "@/lib/time";
import { recordCheckIn, recordCheckOut, type PunchSummary } from "@/server/checkin";

const punchSchema = z.object({
  lat: z.coerce.number({ message: "Location is missing." }).min(-90).max(90),
  lng: z.coerce.number({ message: "Location is missing." }).min(-180).max(180),
  accuracy: z.coerce.number({ message: "Location is missing." }).min(0).max(100_000),
  photo: z.string({ message: "Take a selfie first." }).min(1, "Take a selfie first.").max(3_000_000),
});

const checkInSchema = punchSchema.extend({
  deviceId: z.string().trim().max(100).optional(),
});

function flagNote(s: PunchSummary): string {
  const notes: string[] = [];
  if (s.flags.weakGps) notes.push("weak GPS");
  if (s.flags.outsideOffice) notes.push("outside office radius");
  if (s.flags.newDevice) notes.push("new device");
  return notes.length ? ` Flagged for review: ${notes.join(", ")}.` : "";
}

function refresh() {
  revalidatePath("/me");
  revalidatePath("/me/history");
}

export async function checkInAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer();
    const data = checkInSchema.parse(formToObject(fd));
    const summary = await recordCheckIn(viewer.employee.id, {
      lat: data.lat,
      lng: data.lng,
      accuracy: data.accuracy,
      photoDataUrl: data.photo,
      deviceId: data.deviceId ?? "",
    });
    refresh();
    const status = labelOf(attendanceStatus, summary.status).label;
    const late = summary.lateMinutes ? ` (${formatDuration(summary.lateMinutes)} late)` : "";
    return {
      ok: true,
      message: `Checked in at ${formatTime(summary.at, env.timezone)} · ${status}${late}.${flagNote(summary)}`,
    };
  } catch (e) {
    return actionError(e);
  }
}

export async function checkOutAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer();
    const data = punchSchema.parse(formToObject(fd));
    const summary = await recordCheckOut(viewer.employee.id, {
      lat: data.lat,
      lng: data.lng,
      accuracy: data.accuracy,
      photoDataUrl: data.photo,
    });
    refresh();
    return {
      ok: true,
      message: `Checked out at ${formatTime(summary.at, env.timezone)} · worked ${formatDuration(
        summary.workedMinutes ?? 0,
      )}.${flagNote(summary)}`,
    };
  } catch (e) {
    return actionError(e);
  }
}
