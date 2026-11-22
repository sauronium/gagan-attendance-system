import type { AttendanceStatus } from "@/db/schema/attendance";

import { timeToMinutes } from "./time";

// Pure functions that turn check-in/out times into an attendance status,
// using one shift's rules. All times are minutes since local midnight.

export type ShiftRules = {
  startTime: string; // "09:30:00"
  endTime: string;
  crossesMidnight: boolean;
  breakMinutes: number;
  graceMinutes: number;
  halfDayAfter: string | null;
  halfDayBelowMinutes: number;
  absentBelowMinutes: number;
  overtimeAfterMinutes: number;
};

/** Default rules for staff with no shift assigned (9:30–6:30). */
export const DEFAULT_SHIFT: ShiftRules = {
  startTime: "09:30:00",
  endTime: "18:30:00",
  crossesMidnight: false,
  breakMinutes: 60,
  graceMinutes: 15,
  halfDayAfter: "11:00:00",
  halfDayBelowMinutes: 270,
  absentBelowMinutes: 120,
  overtimeAfterMinutes: 30,
};

export function evaluateCheckIn(
  checkInMin: number,
  shift: ShiftRules,
): { status: AttendanceStatus; lateMinutes: number } {
  const start = timeToMinutes(shift.startTime);
  const graceEnd = start + shift.graceMinutes;
  if (checkInMin <= graceEnd) return { status: "present", lateMinutes: 0 };
  const lateMinutes = checkInMin - start;
  if (shift.halfDayAfter && checkInMin > timeToMinutes(shift.halfDayAfter)) {
    return { status: "half_day", lateMinutes };
  }
  return { status: "late", lateMinutes };
}

export function evaluateCheckOut(
  input: { checkInMin: number; checkOutMin: number; checkInStatus: AttendanceStatus },
  shift: ShiftRules,
): { status: AttendanceStatus; workedMinutes: number; overtimeMinutes: number } {
  let out = input.checkOutMin;
  if (out < input.checkInMin) out += 24 * 60; // crossed midnight
  const span = out - input.checkInMin;
  // Deduct the break only when the day was long enough to include one.
  const workedMinutes = Math.max(0, span >= 5 * 60 ? span - shift.breakMinutes : span);

  let end = timeToMinutes(shift.endTime);
  if (shift.crossesMidnight && end < timeToMinutes(shift.startTime)) end += 24 * 60;
  const overtimeMinutes = Math.max(0, out - (end + shift.overtimeAfterMinutes));

  let status: AttendanceStatus = input.checkInStatus;
  if (workedMinutes < shift.absentBelowMinutes) status = "absent";
  else if (workedMinutes < shift.halfDayBelowMinutes) status = "half_day";

  return { status, workedMinutes, overtimeMinutes };
}

/** How much of a day each status is worth in payroll exports. */
export const dayValue: Record<AttendanceStatus, number> = {
  present: 1,
  late: 1,
  half_day: 0.5,
  absent: 0,
  on_leave: 1,
  holiday: 1,
  week_off: 1,
  missed_punch: 0,
};
