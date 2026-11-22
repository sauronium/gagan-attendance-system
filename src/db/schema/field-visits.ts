import {
  date,
  index,
  int,
  mysqlTable,
  text,
  varchar,
} from "drizzle-orm/mysql-core";

import {
  coordinate,
  dateTime,
  fileKey,
  id,
  json,
  phone,
  ref,
  timestamps,
} from "./columns";
import { clients, clientSites, serviceVisits } from "./clients";
import { employees } from "./people";

// ── Value sets ───────────────────────────────────────────────

export const visitPurposes = [
  "sales_pitch",
  "demo",
  "follow_up",
  "amc_service",
  "complaint",
  "payment_collection",
  "installation",
  "other",
  /** A geo-stamped photo of where the employee is (travel, sites without a client record). */
  "location_tag",
] as const;
export type VisitPurpose = (typeof visitPurposes)[number];

export const visitOutcomes = [
  "interested",
  "quotation_requested",
  "order_won",
  "not_interested",
  "revisit",
] as const;
export type VisitOutcome = (typeof visitOutcomes)[number];

export const visitStatuses = ["pending", "verified", "rejected"] as const;
export type VisitStatus = (typeof visitStatuses)[number];

export type VisitFlags = {
  weakGps?: boolean;
  /** Logged further than the allowed distance from the client's site pin. */
  farFromSite?: boolean;
};

export const followUpStatuses = ["open", "done", "cancelled"] as const;
export type FollowUpStatus = (typeof followUpStatuses)[number];

// ── Tables ───────────────────────────────────────────────────

/** One client stop logged by a sales agent or technician. */
export const fieldVisits = mysqlTable(
  "field_visits",
  {
    id: id(),
    employeeId: ref()
      .notNull()
      .references(() => employees.id),
    /** Existing client; null when visiting a new prospect. */
    clientId: ref().references(() => clients.id),
    siteId: ref().references(() => clientSites.id),
    prospectName: varchar({ length: 150 }),
    prospectPhone: phone(),
    /** Location tags: what the employee called the place, e.g. "Okhla market". */
    placeLabel: varchar({ length: 150 }),
    purpose: varchar({ length: 20 }).$type<VisitPurpose>().notNull(),
    contactName: varchar({ length: 120 }),
    contactPhone: phone(),
    notes: text(),
    outcome: varchar({ length: 20 }).$type<VisitOutcome>(),

    /** Server time when the visit was logged. */
    loggedAt: dateTime().notNull(),
    lat: coordinate().notNull(),
    lng: coordinate().notNull(),
    accuracyM: int({ unsigned: true }),
    photoKey: fileKey(),
    distanceFromSiteM: int({ unsigned: true }),
    flags: json().$type<VisitFlags>(),

    status: varchar({ length: 10 })
      .$type<VisitStatus>()
      .notNull()
      .default("pending"),
    reviewedBy: ref().references(() => employees.id),
    reviewedAt: dateTime(),
    /** Required when rejected. */
    reviewRemark: varchar({ length: 255 }),

    /** AMC service this visit completed, when logged by a technician. */
    serviceVisitId: ref().references(() => serviceVisits.id),
    ...timestamps(),
  },
  (t) => [
    index("field_visits_employee_logged_idx").on(t.employeeId, t.loggedAt),
    index("field_visits_status_logged_idx").on(t.status, t.loggedAt),
  ],
);

/** Reminder for the agent to revisit or call back. */
export const followUps = mysqlTable(
  "follow_ups",
  {
    id: id(),
    fieldVisitId: ref()
      .notNull()
      .references(() => fieldVisits.id, { onDelete: "cascade" }),
    employeeId: ref()
      .notNull()
      .references(() => employees.id),
    clientId: ref().references(() => clients.id),
    dueOn: date({ mode: "string" }).notNull(),
    note: varchar({ length: 255 }),
    status: varchar({ length: 10 })
      .$type<FollowUpStatus>()
      .notNull()
      .default("open"),
    doneAt: dateTime(),
    ...timestamps(),
  },
  (t) => [
    index("follow_ups_employee_status_due_idx").on(
      t.employeeId,
      t.status,
      t.dueOn,
    ),
  ],
);
