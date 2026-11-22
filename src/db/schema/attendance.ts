import {
  date,
  index,
  int,
  mysqlTable,
  smallint,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

import {
  coordinate,
  dateTime,
  fileKey,
  id,
  json,
  ref,
  timestamps,
} from "./columns";
import { leaveRequests } from "./leave";
import { employees, officeLocations, shifts } from "./people";

// ── Value sets ───────────────────────────────────────────────

export const attendanceStatuses = [
  "present",
  "late",
  "half_day",
  "absent",
  "on_leave",
  "holiday",
  "week_off",
  "missed_punch",
] as const;
export type AttendanceStatus = (typeof attendanceStatuses)[number];

/** Review flags raised automatically or by an admin edit. */
export type AttendanceFlags = {
  weakGps?: boolean;
  outsideOffice?: boolean;
  newDevice?: boolean;
  manualEdit?: boolean;
  /** Set by the nightly job (absent / holiday / week off). */
  autoMarked?: boolean;
};

export const regularisationTypes = [
  "missed_check_in",
  "missed_check_out",
  "wrong_status",
  "on_duty",
] as const;
export type RegularisationType = (typeof regularisationTypes)[number];

export const requestStatuses = [
  "pending",
  "approved",
  "rejected",
  "withdrawn",
] as const;
export type RequestStatus = (typeof requestStatuses)[number];

// ── Tables ───────────────────────────────────────────────────

/** One row per employee per day. */
export const attendance = mysqlTable(
  "attendance",
  {
    id: id(),
    employeeId: ref()
      .notNull()
      .references(() => employees.id),
    /** Attendance day in APP_TIMEZONE. */
    date: date({ mode: "string" }).notNull(),
    /** Shift the day was judged against (kept even if the employee's shift changes later). */
    shiftId: ref().references(() => shifts.id),
    status: varchar({ length: 15 }).$type<AttendanceStatus>().notNull(),

    checkInAt: dateTime(),
    checkInLat: coordinate(),
    checkInLng: coordinate(),
    checkInAccuracyM: int({ unsigned: true }),
    /** Nearest allowed office, and how far the check-in was from it. */
    checkInLocationId: ref().references(() => officeLocations.id),
    checkInDistanceM: int({ unsigned: true }),
    checkInPhotoKey: fileKey(),

    checkOutAt: dateTime(),
    checkOutLat: coordinate(),
    checkOutLng: coordinate(),
    checkOutAccuracyM: int({ unsigned: true }),
    checkOutPhotoKey: fileKey(),

    workedMinutes: smallint({ unsigned: true }).notNull().default(0),
    lateMinutes: smallint({ unsigned: true }).notNull().default(0),
    overtimeMinutes: smallint({ unsigned: true }).notNull().default(0),

    /** Approved leave that covers this day, when status is on_leave / half_day. */
    leaveRequestId: ref().references(() => leaveRequests.id),
    flags: json().$type<AttendanceFlags>(),
    note: varchar({ length: 255 }),
    /** Last admin who edited the row by hand (details in audit_log). */
    updatedBy: ref().references(() => employees.id),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("attendance_employee_date_uq").on(t.employeeId, t.date),
    index("attendance_date_status_idx").on(t.date, t.status),
  ],
);

/** Employee request to correct a day: missed punch, wrong status, on-duty. */
export const regularisations = mysqlTable(
  "regularisations",
  {
    id: id(),
    employeeId: ref()
      .notNull()
      .references(() => employees.id),
    date: date({ mode: "string" }).notNull(),
    /** Null when there is no attendance row yet (e.g. missed check-in). */
    attendanceId: ref().references(() => attendance.id),
    type: varchar({ length: 20 }).$type<RegularisationType>().notNull(),
    requestedCheckInAt: dateTime(),
    requestedCheckOutAt: dateTime(),
    reason: varchar({ length: 500 }).notNull(),
    status: varchar({ length: 10 })
      .$type<RequestStatus>()
      .notNull()
      .default("pending"),
    decidedBy: ref().references(() => employees.id),
    decidedAt: dateTime(),
    decisionRemark: varchar({ length: 255 }),
    ...timestamps(),
  },
  (t) => [
    index("regularisations_employee_date_idx").on(t.employeeId, t.date),
    index("regularisations_status_idx").on(t.status),
  ],
);
