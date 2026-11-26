import {
  type AnyMySqlColumn,
  boolean,
  date,
  index,
  mysqlTable,
  primaryKey,
  smallint,
  text,
  time,
  tinyint,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

import {
  coordinate,
  createdAt,
  fileKey,
  id,
  json,
  money,
  phone,
  ref,
  timestamps,
} from "./columns";
import { user } from "./auth";
import { leavePolicies } from "./leave";

// ── Value sets ───────────────────────────────────────────────

export const employeeRoles = [
  "super_admin",
  "office_admin",
  "employee",
  "technician",
] as const;
export type EmployeeRole = (typeof employeeRoles)[number];

export const workTypes = ["office", "field", "both"] as const;
export type WorkType = (typeof workTypes)[number];

export const employeeStatuses = ["active", "on_notice", "inactive"] as const;
export type EmployeeStatus = (typeof employeeStatuses)[number];

// ── Tables ───────────────────────────────────────────────────

export const departments = mysqlTable(
  "departments",
  {
    id: id(),
    name: varchar({ length: 100 }).notNull(),
    headEmployeeId: ref().references((): AnyMySqlColumn => employees.id),
    isActive: boolean().notNull().default(true),
    ...timestamps(),
  },
  (t) => [uniqueIndex("departments_name_uq").on(t.name)],
);

/** Shift timings and the rules that turn a check-in into a status. */
export const shifts = mysqlTable("shifts", {
  id: id(),
  name: varchar({ length: 100 }).notNull(),
  startTime: time().notNull(),
  endTime: time().notNull(),
  /** True when the shift ends after midnight (night shift). */
  crossesMidnight: boolean().notNull().default(false),
  breakMinutes: smallint({ unsigned: true }).notNull().default(60),
  /** Check-in up to start + grace counts as on time. */
  graceMinutes: smallint({ unsigned: true }).notNull().default(15),
  /** Check-in after this time is a half-day rather than late. */
  halfDayAfter: time(),
  /** Worked less than this many minutes → half-day. */
  halfDayBelowMinutes: smallint({ unsigned: true }).notNull().default(270),
  /** Worked less than this many minutes → absent. */
  absentBelowMinutes: smallint({ unsigned: true }).notNull().default(120),
  /** Minutes after shift end before overtime starts counting. */
  overtimeAfterMinutes: smallint({ unsigned: true }).notNull().default(30),
  /** Late marks in a month that equal one half-day cut (0 = rule off). */
  latesPerHalfDay: tinyint({ unsigned: true }).notNull().default(3),
  /** Weekly off days, 0 = Sunday … 6 = Saturday. */
  weeklyOffs: json().$type<number[]>().notNull(),
  isActive: boolean().notNull().default(true),
  ...timestamps(),
});

/** Offices / plants where office staff are expected to check in. */
export const officeLocations = mysqlTable("office_locations", {
  id: id(),
  name: varchar({ length: 100 }).notNull(),
  address: varchar({ length: 255 }),
  lat: coordinate().notNull(),
  lng: coordinate().notNull(),
  /** Check-ins further than this from the point are flagged. */
  radiusM: smallint({ unsigned: true }).notNull().default(150),
  isActive: boolean().notNull().default(true),
  ...timestamps(),
});

export const employees = mysqlTable(
  "employees",
  {
    id: id(),
    empCode: varchar({ length: 20 }).notNull(),
    name: varchar({ length: 120 }).notNull(),
    /** Login identifier. */
    mobile: phone().notNull(),
    email: varchar({ length: 191 }),
    photoKey: fileKey(),
    role: varchar({ length: 20 })
      .$type<EmployeeRole>()
      .notNull()
      .default("employee"),
    departmentId: ref().references(() => departments.id),
    designation: varchar({ length: 100 }),
    shiftId: ref().references(() => shifts.id),
    /** Reporting manager (shown on the profile; approvals are done by admins). */
    managerId: ref().references((): AnyMySqlColumn => employees.id),
    leavePolicyId: ref().references(() => leavePolicies.id),
    workType: varchar({ length: 10 })
      .$type<WorkType>()
      .notNull()
      .default("office"),
    status: varchar({ length: 12 })
      .$type<EmployeeStatus>()
      .notNull()
      .default("active"),
    joinedOn: date({ mode: "string" }),
    leftOn: date({ mode: "string" }),
    dateOfBirth: date({ mode: "string" }),
    address: text(),
    emergencyContactName: varchar({ length: 120 }),
    emergencyContactPhone: phone(),
    /** Used only in payroll exports; payroll itself runs elsewhere. */
    monthlySalary: money(),
    /** The one device allowed to check in; a new device needs admin OK. */
    activeDeviceId: varchar({ length: 100 }),
    /** Better Auth login for this employee (null = cannot sign in). */
    userId: varchar({ length: 36 }).references(() => user.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("employees_emp_code_uq").on(t.empCode),
    uniqueIndex("employees_mobile_uq").on(t.mobile),
    uniqueIndex("employees_user_id_uq").on(t.userId),
    index("employees_status_role_idx").on(t.status, t.role),
  ],
);

/** Office locations an employee may check in at (none = any allowed for field staff). */
export const employeeLocations = mysqlTable(
  "employee_locations",
  {
    employeeId: ref()
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    locationId: ref()
      .notNull()
      .references(() => officeLocations.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.employeeId, t.locationId] })],
);

export const employeeDocuments = mysqlTable("employee_documents", {
  id: id(),
  employeeId: ref()
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  label: varchar({ length: 100 }).notNull(),
  fileKey: fileKey().notNull(),
  uploadedBy: ref().references(() => employees.id),
  createdAt: createdAt(),
});

export const holidays = mysqlTable(
  "holidays",
  {
    id: id(),
    date: date({ mode: "string" }).notNull(),
    name: varchar({ length: 100 }).notNull(),
    /** Optional / restricted holiday that employees may choose to take. */
    isOptional: boolean().notNull().default(false),
    ...timestamps(),
  },
  (t) => [uniqueIndex("holidays_date_uq").on(t.date)],
);
