import "server-only";

import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";

import { db } from "@/db";
import {
  attendance,
  clients,
  clientSites,
  complaints,
  type EmployeeRole,
  employees,
  fieldVisits,
  followUps,
  holidays,
  installations,
  leaveRequests,
  type PartUsed,
  serviceVisits,
  type VisitFlags,
  type VisitOutcome,
  type VisitPurpose,
} from "@/db/schema";
import { DEFAULT_SHIFT } from "@/lib/attendance-rules";
import { env } from "@/lib/env";
import { distanceM, FAR_FROM_SITE_M, WEAK_GPS_M } from "@/lib/geo";
import { decodeDataUrl, putFile } from "@/lib/storage";
import { addDays, formatDate, isoDateInTz, weekdayIndex } from "@/lib/time";
import { sendTemplated, TEMPLATE_KEYS } from "@/server/sms-templates";

// Queries and writes used only by the staff app (/me).

// ── Helpers ──────────────────────────────────────────────────

/** "2026-11-30" + 3 months → "2027-02-28" (clamped to the month's last day). */
export function addMonthsIso(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const last = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, last))).toISOString().slice(0, 10);
}

/** "Filter x1, Membrane ×2\nPump" → [{ name: "Filter", qty: 1 }, …]. */
function parseParts(text: string | null | undefined): PartUsed[] {
  if (!text) return [];
  return text
    .split(/[,\n;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/^(.*?)\s*[x×*]\s*(\d+)$/i) ?? s.match(/^(.*?)\s+(\d+)$/);
      const name = (m ? m[1] : s).trim().slice(0, 100);
      const qty = m ? Math.max(1, Math.min(999, Number(m[2]))) : 1;
      return { name: name || s.slice(0, 100), qty };
    });
}

/**
 * Status key to show for a day (a key of lib/labels attendanceStatus), or
 * null when there's nothing to show (future day, or a past working day with
 * no record yet).
 */
export function resolveDayStatus(
  row: { status: string } | null | undefined,
  day: { isToday: boolean; isFuture: boolean; isHoliday: boolean; isWeekOff: boolean; onLeave?: boolean },
): string | null {
  if (row) return row.status;
  if (day.onLeave) return "on_leave";
  if (day.isHoliday) return "holiday";
  if (day.isWeekOff) return "week_off";
  if (day.isToday) return "not_checked_in";
  return null;
}

export type ShiftInfo = {
  id: number | null;
  name: string;
  startTime: string;
  endTime: string;
  weeklyOffs: number[];
  crossesMidnight: boolean;
};

export async function getShiftInfo(employeeId: number): Promise<ShiftInfo> {
  const emp = await db.query.employees.findFirst({
    where: eq(employees.id, employeeId),
    columns: { id: true },
    with: { shift: true },
  });
  const s = emp?.shift && emp.shift.isActive ? emp.shift : null;
  if (!s) {
    return {
      id: null,
      name: "General shift",
      startTime: DEFAULT_SHIFT.startTime,
      endTime: DEFAULT_SHIFT.endTime,
      weeklyOffs: [0],
      crossesMidnight: false,
    };
  }
  return {
    id: s.id,
    name: s.name,
    startTime: s.startTime,
    endTime: s.endTime,
    weeklyOffs: s.weeklyOffs ?? [0],
    crossesMidnight: s.crossesMidnight,
  };
}

/** Today's attendance row plus whether today is a holiday, week off or approved leave. */
export async function getTodayContext(employeeId: number) {
  const tz = env.timezone;
  const today = isoDateInTz(new Date(), tz);
  const [shift, row, holiday, leave] = await Promise.all([
    getShiftInfo(employeeId),
    db.query.attendance.findFirst({
      where: and(eq(attendance.employeeId, employeeId), eq(attendance.date, today)),
      with: { checkInLocation: { columns: { name: true } } },
    }),
    db.query.holidays.findFirst({ where: and(eq(holidays.date, today), eq(holidays.isOptional, false)) }),
    db.query.leaveRequests.findFirst({
      where: and(
        eq(leaveRequests.employeeId, employeeId),
        eq(leaveRequests.status, "approved"),
        lte(leaveRequests.fromDate, today),
        gte(leaveRequests.toDate, today),
      ),
      with: { leaveType: { columns: { name: true } } },
    }),
  ]);
  return {
    today,
    shift,
    row: row ?? null,
    holiday: holiday ?? null,
    isWeekOff: shift.weeklyOffs.includes(weekdayIndex(today)),
    leave: leave ?? null,
  };
}

/** The attendance row the employee is currently checked in on (none if not in, or already out). */
export async function getOpenPunch(employeeId: number) {
  const today = isoDateInTz(new Date(), env.timezone);
  const rows = await db.query.attendance.findMany({
    where: and(eq(attendance.employeeId, employeeId), inArray(attendance.date, [today, addDays(today, -1)])),
    with: { shift: { columns: { crossesMidnight: true } } },
  });
  const todayRow = rows.find((r) => r.date === today);
  if (todayRow?.checkInAt && !todayRow.checkOutAt) return todayRow;
  if (todayRow?.checkInAt) return null;
  const y = rows.find((r) => r.date !== today);
  if (y?.checkInAt && !y.checkOutAt && y.shift?.crossesMidnight) return y;
  return null;
}

// ── Field visits ─────────────────────────────────────────────

export type LogVisitInput = {
  clientId?: number;
  prospectName?: string;
  prospectPhone?: string;
  purpose: VisitPurpose;
  contactName?: string;
  contactPhone?: string;
  notes?: string;
  outcome?: VisitOutcome;
  followUpOn?: string;
  followUpNote?: string;
  lat: number;
  lng: number;
  accuracy: number;
  photoDataUrl?: string;
};

export async function logFieldVisit(
  employee: { id: number; role: EmployeeRole },
  input: LogVisitInput,
) {
  const tz = env.timezone;
  if (!(await getOpenPunch(employee.id))) {
    throw new Error("Check in first. Visits can only be logged while you are checked in.");
  }
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng) || !Number.isFinite(input.accuracy)) {
    throw new Error("Location is required. Allow location access and try again.");
  }
  if (!input.clientId && !input.prospectName) throw new Error("Pick a client or enter the prospect's name.");

  const now = new Date();
  const today = isoDateInTz(now, tz);

  // Distance from the client's first site that has a pin.
  let siteId: number | null = null;
  let distance: number | null = null;
  if (input.clientId) {
    const client = await db.query.clients.findFirst({
      where: eq(clients.id, input.clientId),
      columns: { id: true },
      with: { sites: { orderBy: [asc(clientSites.id)] } },
    });
    if (!client) throw new Error("Client not found.");
    const pinned = client.sites.find((s) => s.lat != null && s.lng != null);
    const site = pinned ?? client.sites[0];
    siteId = site?.id ?? null;
    if (pinned?.lat != null && pinned.lng != null) {
      distance = distanceM(input.lat, input.lng, pinned.lat, pinned.lng);
    }
  }

  const flagsRaw: VisitFlags = {
    weakGps: input.accuracy > WEAK_GPS_M,
    farFromSite: distance != null && distance > FAR_FROM_SITE_M,
  };
  const flags = Object.fromEntries(Object.entries(flagsRaw).filter(([, v]) => v)) as VisitFlags;

  let photoKey: string | null = null;
  if (input.photoDataUrl) {
    const photo = decodeDataUrl(input.photoDataUrl);
    photoKey = await putFile(`visits/${employee.id}/${now.getTime()}.${photo.ext}`, photo.data, photo.contentType);
  }

  // A technician's AMC visit completes their scheduled service due within ±7 days.
  let serviceVisitId: number | null = null;
  let serviceDue: { dueOn: string; type: string } | null = null;
  if (input.purpose === "amc_service" && employee.role === "technician" && input.clientId) {
    const [due] = await db
      .select({ id: serviceVisits.id, dueOn: serviceVisits.dueOn, type: serviceVisits.type })
      .from(serviceVisits)
      .innerJoin(installations, eq(installations.id, serviceVisits.installationId))
      .innerJoin(clientSites, eq(clientSites.id, installations.siteId))
      .where(
        and(
          eq(serviceVisits.technicianId, employee.id),
          eq(serviceVisits.status, "scheduled"),
          eq(clientSites.clientId, input.clientId),
          gte(serviceVisits.dueOn, addDays(today, -7)),
          lte(serviceVisits.dueOn, addDays(today, 7)),
        ),
      )
      .orderBy(asc(serviceVisits.dueOn))
      .limit(1);
    if (due) {
      serviceVisitId = due.id;
      serviceDue = due;
    }
  }

  const visitId = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(fieldVisits)
      .values({
        employeeId: employee.id,
        clientId: input.clientId ?? null,
        siteId,
        prospectName: input.clientId ? null : (input.prospectName ?? null),
        prospectPhone: input.clientId ? null : (input.prospectPhone ?? null),
        purpose: input.purpose,
        contactName: input.contactName ?? null,
        contactPhone: input.contactPhone ?? null,
        notes: input.notes ?? null,
        outcome: input.outcome ?? null,
        loggedAt: now,
        lat: input.lat,
        lng: input.lng,
        accuracyM: Math.round(input.accuracy),
        photoKey,
        distanceFromSiteM: distance,
        flags: Object.keys(flags).length ? flags : null,
        serviceVisitId,
      })
      .$returningId();

    if (input.followUpOn) {
      await tx.insert(followUps).values({
        fieldVisitId: row.id,
        employeeId: employee.id,
        clientId: input.clientId ?? null,
        dueOn: input.followUpOn,
        note: input.followUpNote ?? (input.clientId ? null : (input.prospectName ?? null)),
      });
    }

    if (serviceVisitId && serviceDue) {
      await tx
        .update(serviceVisits)
        .set({
          status: "done",
          doneAt: now,
          notes: input.notes ?? null,
          photoKey,
          nextDueOn: serviceDue.type === "amc" ? addMonthsIso(serviceDue.dueOn, 3) : null,
        })
        .where(eq(serviceVisits.id, serviceVisitId));
    }
    return row.id;
  });

  return { id: visitId, flags, distance, serviceVisitId };
}

// ── Location tags ────────────────────────────────────────────

export type LocationTagInput = {
  lat: number;
  lng: number;
  accuracy: number;
  photoDataUrl: string;
  placeLabel?: string;
  notes?: string;
};

/**
 * A geo-tagged photo of where a field employee is right now: travel stops,
 * sites without a client record, markets they canvass. Stored as a field
 * visit with purpose "location_tag" so it shows on the admin visit map, in
 * the day's route and in the verification queue.
 */
export async function logLocationTag(employeeId: number, input: LocationTagInput) {
  if (!(await getOpenPunch(employeeId))) {
    throw new Error("Check in first. Locations can only be tagged while you are checked in.");
  }
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng) || !Number.isFinite(input.accuracy)) {
    throw new Error("Location is required. Allow location access and try again.");
  }
  if (!input.photoDataUrl) throw new Error("Take a photo of the place to tag it.");

  const now = new Date();
  // Upload before writing the row: slow I/O stays outside the database.
  const photo = decodeDataUrl(input.photoDataUrl);
  const photoKey = await putFile(`visits/${employeeId}/${now.getTime()}-tag.${photo.ext}`, photo.data, photo.contentType);
  const weakGps = input.accuracy > WEAK_GPS_M;

  const [row] = await db
    .insert(fieldVisits)
    .values({
      employeeId,
      purpose: "location_tag",
      placeLabel: input.placeLabel ?? null,
      notes: input.notes ?? null,
      loggedAt: now,
      lat: input.lat,
      lng: input.lng,
      accuracyM: Math.round(input.accuracy),
      photoKey,
      flags: weakGps ? { weakGps: true } : null,
    })
    .$returningId();
  return { id: row.id, weakGps };
}

// ── Technician jobs ──────────────────────────────────────────

/** Scheduled service visits assigned to a technician, due up to `until`. */
export async function getAssignedJobs(technicianId: number, until: string) {
  return db.query.serviceVisits.findMany({
    where: and(
      eq(serviceVisits.technicianId, technicianId),
      // "rescheduled" rows are the replaced originals; the new date has its
      // own scheduled row, so only scheduled visits are jobs.
      eq(serviceVisits.status, "scheduled"),
      lte(serviceVisits.dueOn, until),
    ),
    orderBy: [asc(serviceVisits.dueOn)],
    limit: 200,
    with: {
      installation: {
        with: {
          site: {
            with: {
              client: {
                columns: { id: true, name: true },
                with: { contacts: true },
              },
            },
          },
        },
      },
      complaint: { columns: { id: true, ticketNo: true, issue: true, priority: true } },
      contract: { columns: { id: true, contractNo: true } },
    },
  });
}

export type AssignedJob = Awaited<ReturnType<typeof getAssignedJobs>>[number];

export async function completeServiceVisit(
  technicianId: number,
  input: { id: number; notes?: string; partsText?: string; photoDataUrl?: string; nextDueOn?: string },
) {
  const visit = await db.query.serviceVisits.findFirst({
    where: and(eq(serviceVisits.id, input.id), eq(serviceVisits.technicianId, technicianId)),
    with: {
      installation: { with: { site: { with: { client: { with: { contacts: true } } } } } },
      complaint: true,
    },
  });
  if (!visit) throw new Error("Job not found or not assigned to you.");
  if (visit.status !== "scheduled") {
    throw new Error(
      visit.status === "rescheduled"
        ? "This visit was moved to a new date. Open the new job instead."
        : `This job is already ${visit.status}.`,
    );
  }

  const now = new Date();
  const partsUsed = parseParts(input.partsText);

  let photoKey: string | null = visit.photoKey;
  if (input.photoDataUrl) {
    const photo = decodeDataUrl(input.photoDataUrl);
    photoKey = await putFile(`jobs/${technicianId}/${visit.id}-${now.getTime()}.${photo.ext}`, photo.data, photo.contentType);
  }

  const nextDueOn = input.nextDueOn ?? (visit.type === "amc" ? addMonthsIso(visit.dueOn, 3) : null);

  await db.transaction(async (tx) => {
    await tx
      .update(serviceVisits)
      .set({
        status: "done",
        doneAt: now,
        notes: input.notes ?? null,
        partsUsed: partsUsed.length ? partsUsed : null,
        photoKey,
        nextDueOn,
      })
      .where(eq(serviceVisits.id, visit.id));
    if (visit.complaint && visit.complaint.status !== "resolved" && visit.complaint.status !== "closed") {
      await tx
        .update(complaints)
        .set({ status: "resolved", resolvedAt: now, resolutionNotes: input.notes ?? null })
        .where(eq(complaints.id, visit.complaint.id));
    }
  });

  // Client SMS (never blocks completing the job).
  const client = visit.installation.site.client;
  const contact =
    client.contacts.find((c) => c.isPrimary && c.smsOptIn) ?? client.contacts.find((c) => c.smsOptIn);
  let smsSent = false;
  if (contact) {
    try {
      const target = {
        phone: contact.phone,
        clientId: client.id,
        contactId: contact.id,
        employeeId: technicianId,
        refType: "service_visit",
        refId: visit.id,
      };
      const res = visit.complaint
        ? await sendTemplated(
            TEMPLATE_KEYS.complaintResolved,
            { client: client.name, ticket: visit.complaint.ticketNo },
            { ...target, dedupeKey: `complaint_resolved:${visit.complaint.id}` },
          )
        : await sendTemplated(
            TEMPLATE_KEYS.serviceCompleted,
            { client: client.name, nextDate: nextDueOn ? formatDate(nextDueOn) : "to be confirmed" },
            { ...target, dedupeKey: `service_completed:${visit.id}` },
          );
      smsSent = Boolean(res && res.status !== "failed");
    } catch (e) {
      console.error("service completion SMS failed", e);
    }
  }

  return { nextDueOn, partsUsed, complaintResolved: Boolean(visit.complaint), smsSent };
}
