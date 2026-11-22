import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  attendance,
  type AttendanceFlags,
  type AttendanceStatus,
  employeeLocations,
  employees,
  officeLocations,
  shifts,
} from "@/db/schema";
import { DEFAULT_SHIFT, evaluateCheckIn, evaluateCheckOut, type ShiftRules } from "@/lib/attendance-rules";
import { env } from "@/lib/env";
import { distanceM, WEAK_GPS_M } from "@/lib/geo";
import { decodeDataUrl, putFile } from "@/lib/storage";
import { addDays, isoDateInTz, minutesOfDay } from "@/lib/time";

// Check-in / check-out for the staff app. The server clock is the only
// source of time; the phone sends just the GPS fix, the watermarked selfie
// and its device id.

export type PunchInput = {
  lat: number;
  lng: number;
  accuracy: number;
  photoDataUrl: string;
};

export type CheckInInput = PunchInput & { deviceId: string };

export type PunchSummary = {
  status: AttendanceStatus;
  at: Date;
  lateMinutes?: number;
  workedMinutes?: number;
  overtimeMinutes?: number;
  locationName?: string | null;
  distanceM?: number | null;
  flags: AttendanceFlags;
};

type ShiftRow = typeof shifts.$inferSelect;

function rulesOf(shift: ShiftRow | null | undefined): ShiftRules {
  if (!shift || !shift.isActive) return DEFAULT_SHIFT;
  return {
    startTime: shift.startTime,
    endTime: shift.endTime,
    crossesMidnight: shift.crossesMidnight,
    breakMinutes: shift.breakMinutes,
    graceMinutes: shift.graceMinutes,
    halfDayAfter: shift.halfDayAfter,
    halfDayBelowMinutes: shift.halfDayBelowMinutes,
    absentBelowMinutes: shift.absentBelowMinutes,
    overtimeAfterMinutes: shift.overtimeAfterMinutes,
  };
}

/** Offices this employee may check in at: their assigned ones, else every active office. */
async function allowedLocations(employeeId: number) {
  const assigned = await db
    .select({
      id: officeLocations.id,
      name: officeLocations.name,
      lat: officeLocations.lat,
      lng: officeLocations.lng,
      radiusM: officeLocations.radiusM,
    })
    .from(employeeLocations)
    .innerJoin(officeLocations, eq(officeLocations.id, employeeLocations.locationId))
    .where(and(eq(employeeLocations.employeeId, employeeId), eq(officeLocations.isActive, true)));
  if (assigned.length) return assigned;
  return db
    .select({
      id: officeLocations.id,
      name: officeLocations.name,
      lat: officeLocations.lat,
      lng: officeLocations.lng,
      radiusM: officeLocations.radiusM,
    })
    .from(officeLocations)
    .where(eq(officeLocations.isActive, true));
}

function validFix(input: PunchInput) {
  const ok =
    Number.isFinite(input.lat) &&
    Number.isFinite(input.lng) &&
    Math.abs(input.lat) <= 90 &&
    Math.abs(input.lng) <= 180 &&
    Number.isFinite(input.accuracy) &&
    input.accuracy >= 0;
  if (!ok) throw new Error("Location is missing. Allow location access and try again.");
}

/** Only the flags that are set, so stored JSON stays small. */
function cleanFlags(flags: AttendanceFlags): AttendanceFlags | null {
  const out = Object.fromEntries(Object.entries(flags).filter(([, v]) => v)) as AttendanceFlags;
  return Object.keys(out).length ? out : null;
}

export async function recordCheckIn(employeeId: number, input: CheckInInput): Promise<PunchSummary> {
  validFix(input);
  const tz = env.timezone;
  const now = new Date();
  const date = isoDateInTz(now, tz);

  const emp = await db.query.employees.findFirst({
    where: eq(employees.id, employeeId),
    with: { shift: true },
  });
  if (!emp) throw new Error("Employee not found.");

  const existing = await db.query.attendance.findFirst({
    where: and(eq(attendance.employeeId, employeeId), eq(attendance.date, date)),
  });
  if (existing?.checkInAt) throw new Error("You have already checked in today.");

  const shift = emp.shift && emp.shift.isActive ? emp.shift : null;
  const rules = rulesOf(shift);

  // Nearest allowed office and how far away the fix is.
  const locations = await allowedLocations(employeeId);
  let nearest: (typeof locations)[number] | null = null;
  let nearestDistance: number | null = null;
  for (const loc of locations) {
    const d = distanceM(input.lat, input.lng, loc.lat, loc.lng);
    if (nearestDistance == null || d < nearestDistance) {
      nearest = loc;
      nearestDistance = d;
    }
  }

  const flags: AttendanceFlags = {
    weakGps: input.accuracy > WEAK_GPS_M,
    outsideOffice:
      emp.workType === "office" && nearest != null && nearestDistance != null && nearestDistance > nearest.radiusM,
  };

  const deviceId = input.deviceId.trim().slice(0, 100);
  if (deviceId) {
    if (!emp.activeDeviceId) {
      await db.update(employees).set({ activeDeviceId: deviceId }).where(eq(employees.id, employeeId));
    } else if (emp.activeDeviceId !== deviceId) {
      flags.newDevice = true;
    }
  }

  const evaluated = evaluateCheckIn(minutesOfDay(now, tz), rules);
  // An approved half-day leave keeps the day a half-day.
  const status: AttendanceStatus =
    existing?.status === "half_day" && existing.leaveRequestId ? "half_day" : evaluated.status;

  const photo = decodeDataUrl(input.photoDataUrl);
  const photoKey = await putFile(`attendance/${employeeId}/${date}-in.${photo.ext}`, photo.data, photo.contentType);

  // The day is no longer auto-marked once the employee punches in.
  const keptFlags: AttendanceFlags = { ...(existing?.flags ?? {}) };
  delete keptFlags.autoMarked;
  const storedFlags = cleanFlags({ ...keptFlags, ...flags });

  const values = {
    shiftId: shift?.id ?? null,
    status,
    checkInAt: now,
    checkInLat: input.lat,
    checkInLng: input.lng,
    checkInAccuracyM: Math.round(input.accuracy),
    checkInLocationId: nearest?.id ?? null,
    checkInDistanceM: nearestDistance,
    checkInPhotoKey: photoKey,
    lateMinutes: evaluated.lateMinutes,
    flags: storedFlags,
  };
  await db
    .insert(attendance)
    .values({ employeeId, date, ...values })
    .onDuplicateKeyUpdate({ set: values });

  return {
    status,
    at: now,
    lateMinutes: evaluated.lateMinutes,
    locationName: nearest?.name ?? null,
    distanceM: nearestDistance,
    flags: storedFlags ?? {},
  };
}

export async function recordCheckOut(employeeId: number, input: PunchInput): Promise<PunchSummary> {
  validFix(input);
  const tz = env.timezone;
  const now = new Date();
  const date = isoDateInTz(now, tz);

  let row = await db.query.attendance.findFirst({
    where: and(eq(attendance.employeeId, employeeId), eq(attendance.date, date)),
    with: { shift: true },
  });

  // Night shift: the open punch may belong to yesterday.
  if (!row?.checkInAt) {
    const yesterday = await db.query.attendance.findFirst({
      where: and(eq(attendance.employeeId, employeeId), eq(attendance.date, addDays(date, -1))),
      with: { shift: true },
    });
    if (yesterday?.checkInAt && !yesterday.checkOutAt && yesterday.shift?.crossesMidnight) row = yesterday;
  }

  if (!row?.checkInAt) throw new Error("You haven't checked in today.");
  if (row.checkOutAt) throw new Error("You have already checked out today.");

  let shiftRow = row.shift;
  if (!shiftRow) {
    const emp = await db.query.employees.findFirst({
      where: eq(employees.id, employeeId),
      with: { shift: true },
    });
    shiftRow = emp?.shift ?? null;
  }
  const rules = rulesOf(shiftRow);

  const result = evaluateCheckOut(
    {
      checkInMin: minutesOfDay(row.checkInAt, tz),
      checkOutMin: minutesOfDay(now, tz),
      checkInStatus: row.status,
    },
    rules,
  );

  const photo = decodeDataUrl(input.photoDataUrl);
  const photoKey = await putFile(`attendance/${employeeId}/${row.date}-out.${photo.ext}`, photo.data, photo.contentType);

  const flags = cleanFlags({
    ...(row.flags ?? {}),
    weakGps: Boolean(row.flags?.weakGps) || input.accuracy > WEAK_GPS_M,
  });

  await db
    .update(attendance)
    .set({
      status: result.status,
      checkOutAt: now,
      checkOutLat: input.lat,
      checkOutLng: input.lng,
      checkOutAccuracyM: Math.round(input.accuracy),
      checkOutPhotoKey: photoKey,
      workedMinutes: result.workedMinutes,
      overtimeMinutes: result.overtimeMinutes,
      flags,
    })
    .where(eq(attendance.id, row.id));

  return {
    status: result.status,
    at: now,
    workedMinutes: result.workedMinutes,
    overtimeMinutes: result.overtimeMinutes,
    flags: flags ?? {},
  };
}
