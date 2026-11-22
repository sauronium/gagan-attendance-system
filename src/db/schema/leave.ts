import {
  boolean,
  date,
  index,
  mysqlTable,
  primaryKey,
  smallint,
  tinyint,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

import {
  createdAt,
  dateTime,
  fileKey,
  id,
  leaveDays,
  ref,
  timestamps,
} from "./columns";
import { employees } from "./people";

// ── Value sets ───────────────────────────────────────────────

export const accrualModes = ["yearly", "monthly", "none"] as const;
export type AccrualMode = (typeof accrualModes)[number];

export const leaveRequestStatuses = [
  "pending",
  "approved",
  "rejected",
  "withdrawn",
  /** Approved leave cancelled before it started; balance restored. */
  "cancelled",
] as const;
export type LeaveRequestStatus = (typeof leaveRequestStatuses)[number];

export const halfDaySessions = ["first_half", "second_half"] as const;
export type HalfDaySession = (typeof halfDaySessions)[number];

export const balanceAdjustmentKinds = [
  "manual",
  "accrual",
  "carry_forward",
  "lapse",
  "comp_off",
] as const;
export type BalanceAdjustmentKind = (typeof balanceAdjustmentKinds)[number];

// ── Tables ───────────────────────────────────────────────────

/** A named set of leave rules; each employee is attached to one. */
export const leavePolicies = mysqlTable(
  "leave_policies",
  {
    id: id(),
    name: varchar({ length: 100 }).notNull(),
    isActive: boolean().notNull().default(true),
    ...timestamps(),
  },
  (t) => [uniqueIndex("leave_policies_name_uq").on(t.name)],
);

/** CL, SL, PL, comp-off, leave without pay … */
export const leaveTypes = mysqlTable(
  "leave_types",
  {
    id: id(),
    code: varchar({ length: 10 }).notNull(),
    name: varchar({ length: 60 }).notNull(),
    isPaid: boolean().notNull().default(true),
    isActive: boolean().notNull().default(true),
    ...timestamps(),
  },
  (t) => [uniqueIndex("leave_types_code_uq").on(t.code)],
);

/** How one leave type behaves inside one policy. */
export const leavePolicyTypes = mysqlTable(
  "leave_policy_types",
  {
    policyId: ref()
      .notNull()
      .references(() => leavePolicies.id, { onDelete: "cascade" }),
    leaveTypeId: ref()
      .notNull()
      .references(() => leaveTypes.id),
    yearlyQuota: leaveDays().notNull().default(0),
    accrual: varchar({ length: 10 })
      .$type<AccrualMode>()
      .notNull()
      .default("yearly"),
    /** Max days carried into next year (0 = lapses). */
    carryForwardMax: leaveDays().notNull().default(0),
    minNoticeDays: tinyint({ unsigned: true }).notNull().default(0),
    maxContinuousDays: tinyint({ unsigned: true }),
    /** A document is required when a request is longer than this. */
    documentAfterDays: tinyint({ unsigned: true }),
    /** Credited days expire after this many days (used for comp-off). */
    expiresAfterDays: smallint({ unsigned: true }),
  },
  (t) => [primaryKey({ columns: [t.policyId, t.leaveTypeId] })],
);

/** Balance per employee, leave type and year. available = opening + credited + adjusted − used. */
export const leaveBalances = mysqlTable(
  "leave_balances",
  {
    id: id(),
    employeeId: ref()
      .notNull()
      .references(() => employees.id),
    leaveTypeId: ref()
      .notNull()
      .references(() => leaveTypes.id),
    year: smallint({ unsigned: true }).notNull(),
    opening: leaveDays().notNull().default(0),
    credited: leaveDays().notNull().default(0),
    used: leaveDays().notNull().default(0),
    adjusted: leaveDays().notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("leave_balances_employee_type_year_uq").on(
      t.employeeId,
      t.leaveTypeId,
      t.year,
    ),
  ],
);

/** Every change to a balance other than approved leave: accruals, manual fixes, comp-off grants. */
export const leaveBalanceAdjustments = mysqlTable(
  "leave_balance_adjustments",
  {
    id: id(),
    employeeId: ref()
      .notNull()
      .references(() => employees.id),
    leaveTypeId: ref()
      .notNull()
      .references(() => leaveTypes.id),
    year: smallint({ unsigned: true }).notNull(),
    kind: varchar({ length: 15 }).$type<BalanceAdjustmentKind>().notNull(),
    /** Positive adds days, negative removes them. */
    days: leaveDays().notNull(),
    reason: varchar({ length: 255 }).notNull(),
    expiresOn: date({ mode: "string" }),
    createdBy: ref().references(() => employees.id),
    createdAt: createdAt(),
  },
  (t) => [
    index("leave_adjustments_employee_year_idx").on(t.employeeId, t.year),
  ],
);

export const leaveRequests = mysqlTable(
  "leave_requests",
  {
    id: id(),
    employeeId: ref()
      .notNull()
      .references(() => employees.id),
    leaveTypeId: ref()
      .notNull()
      .references(() => leaveTypes.id),
    fromDate: date({ mode: "string" }).notNull(),
    toDate: date({ mode: "string" }).notNull(),
    /** Set only for a single half-day request (fromDate = toDate). */
    halfDay: varchar({ length: 12 }).$type<HalfDaySession>(),
    /** Working days counted, excluding weekly offs and holidays. */
    days: leaveDays().notNull(),
    reason: varchar({ length: 500 }),
    attachmentKey: fileKey(),
    status: varchar({ length: 10 })
      .$type<LeaveRequestStatus>()
      .notNull()
      .default("pending"),
    approverId: ref().references(() => employees.id),
    decidedAt: dateTime(),
    decisionRemark: varchar({ length: 255 }),
    ...timestamps(),
  },
  (t) => [
    index("leave_requests_employee_from_idx").on(t.employeeId, t.fromDate),
    index("leave_requests_status_from_idx").on(t.status, t.fromDate),
  ],
);
