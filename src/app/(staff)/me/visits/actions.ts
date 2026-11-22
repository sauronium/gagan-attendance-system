"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { followUps, visitOutcomes, visitPurposes } from "@/db/schema";
import { type ActionState, actionError, formToObject, zf } from "@/lib/action";
import { env } from "@/lib/env";
import { isValidPhone, normalizePhone } from "@/lib/phone";
import { assertViewer } from "@/lib/session";
import { todayIso } from "@/lib/time";
import { logFieldVisit, logLocationTag } from "@/server/staff";

const optPhone = () =>
  z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => {
      if (!v) return undefined;
      const p = normalizePhone(v);
      if (!isValidPhone(p)) {
        ctx.addIssue({ code: "custom", message: "Enter a valid phone number." });
        return z.NEVER;
      }
      return p;
    });

const visitSchema = z
  .object({
    mode: z.enum(["client", "prospect"]),
    clientId: zf.optId(),
    prospectName: zf.optText(150),
    prospectPhone: optPhone(),
    purpose: z.enum(visitPurposes, { message: "Pick a purpose" }),
    contactName: zf.optText(120),
    contactPhone: optPhone(),
    notes: zf.optText(2000),
    outcome: z.enum(visitOutcomes).optional(),
    followUpOn: zf.optDate(),
    followUpNote: zf.optText(255),
    lat: z.coerce.number({ message: "Location is required." }).min(-90).max(90),
    lng: z.coerce.number({ message: "Location is required." }).min(-180).max(180),
    accuracy: z.coerce.number({ message: "Location is required." }).min(0).max(100_000),
    photo: z.string().max(3_000_000).optional(),
  })
  .superRefine((d, ctx) => {
    if (d.mode === "client" && !d.clientId) {
      ctx.addIssue({ code: "custom", path: ["clientId"], message: "Pick a client." });
    }
    if (d.mode === "prospect" && !d.prospectName) {
      ctx.addIssue({ code: "custom", path: ["prospectName"], message: "Enter the prospect's name." });
    }
  });

function refresh() {
  revalidatePath("/me/visits");
  revalidatePath("/me");
  revalidatePath("/me/jobs");
}

export async function logVisitAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer();
    const d = visitSchema.parse(formToObject(fd));
    const today = todayIso(env.timezone);
    if (d.followUpOn && d.followUpOn < today) {
      return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: { followUpOn: "Pick today or a later date." } };
    }
    const res = await logFieldVisit(
      { id: viewer.employee.id, role: viewer.employee.role },
      {
        clientId: d.mode === "client" ? d.clientId : undefined,
        prospectName: d.mode === "prospect" ? d.prospectName : undefined,
        prospectPhone: d.mode === "prospect" ? d.prospectPhone : undefined,
        purpose: d.purpose,
        contactName: d.contactName,
        contactPhone: d.contactPhone,
        notes: d.notes,
        outcome: d.outcome,
        followUpOn: d.followUpOn,
        followUpNote: d.followUpNote,
        lat: d.lat,
        lng: d.lng,
        accuracy: d.accuracy,
        photoDataUrl: d.photo,
      },
    );
    refresh();
    const notes: string[] = [];
    if (res.flags.weakGps) notes.push("weak GPS");
    if (res.flags.farFromSite) notes.push("far from the client's site");
    return {
      ok: true,
      message: `Visit logged and sent for review.${res.serviceVisitId ? " The due AMC service was marked done." : ""}${
        notes.length ? ` Flagged: ${notes.join(", ")}.` : ""
      }`,
    };
  } catch (e) {
    return actionError(e);
  }
}

const tagSchema = z.object({
  placeLabel: zf.optText(150),
  notes: zf.optText(1000),
  lat: z.coerce.number({ message: "Location is required." }).min(-90).max(90),
  lng: z.coerce.number({ message: "Location is required." }).min(-180).max(180),
  accuracy: z.coerce.number({ message: "Location is required." }).min(0).max(100_000),
  photo: z.string({ message: "Take a photo of the place." }).min(1, "Take a photo of the place.").max(3_000_000),
});

export async function tagLocationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer();
    if (viewer.employee.workType === "office" && viewer.employee.role !== "technician") {
      throw new Error("Location tags are for field staff.");
    }
    const d = tagSchema.parse(formToObject(fd));
    const res = await logLocationTag(viewer.employee.id, {
      lat: d.lat,
      lng: d.lng,
      accuracy: d.accuracy,
      photoDataUrl: d.photo,
      placeLabel: d.placeLabel,
      notes: d.notes,
    });
    refresh();
    revalidatePath("/visits");
    return {
      ok: true,
      message: `Location tagged${d.placeLabel ? `: ${d.placeLabel}` : ""}.${res.weakGps ? " GPS was weak, so it's flagged for review." : ""}`,
    };
  } catch (e) {
    return actionError(e);
  }
}

export async function followUpDoneAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer();
    const id = zf.id().parse(fd.get("id"));
    const fu = await db.query.followUps.findFirst({
      where: and(eq(followUps.id, id), eq(followUps.employeeId, viewer.employee.id)),
      columns: { id: true, status: true },
    });
    if (!fu) throw new Error("Follow-up not found.");
    if (fu.status !== "open") throw new Error(`This follow-up is already ${fu.status}.`);
    await db.update(followUps).set({ status: "done", doneAt: new Date() }).where(eq(followUps.id, id));
    refresh();
    return { ok: true, message: "Follow-up marked done." };
  } catch (e) {
    return actionError(e);
  }
}
