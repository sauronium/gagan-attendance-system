import {
  type AnyMySqlColumn,
  boolean,
  date,
  index,
  int,
  mysqlTable,
  smallint,
  text,
  tinyint,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

import {
  coordinate,
  dateTime,
  fileKey,
  id,
  json,
  money,
  phone,
  ref,
  timestamps,
} from "./columns";
import { employees } from "./people";

// ── Value sets ───────────────────────────────────────────────

export const clientTypes = ["company", "individual"] as const;
export type ClientType = (typeof clientTypes)[number];

export const clientSegments = [
  "industrial",
  "commercial",
  "domestic",
  "institution",
] as const;
export type ClientSegment = (typeof clientSegments)[number];

export const clientStatuses = ["prospect", "active", "inactive"] as const;
export type ClientStatus = (typeof clientStatuses)[number];

export const installationStatuses = ["active", "removed"] as const;
export type InstallationStatus = (typeof installationStatuses)[number];

export const amcPlans = ["comprehensive", "non_comprehensive"] as const;
export type AmcPlan = (typeof amcPlans)[number];

export const paymentStatuses = ["unpaid", "partial", "paid"] as const;
export type PaymentStatus = (typeof paymentStatuses)[number];

export const contractStatuses = [
  "active",
  "expired",
  "renewed",
  "cancelled",
] as const;
export type ContractStatus = (typeof contractStatuses)[number];

export const complaintPriorities = ["low", "normal", "high", "urgent"] as const;
export type ComplaintPriority = (typeof complaintPriorities)[number];

export const complaintStatuses = [
  "open",
  "assigned",
  "in_progress",
  "resolved",
  "closed",
] as const;
export type ComplaintStatus = (typeof complaintStatuses)[number];

export const serviceVisitTypes = [
  "amc",
  "complaint",
  "installation",
  "paid",
] as const;
export type ServiceVisitType = (typeof serviceVisitTypes)[number];

export const serviceVisitStatuses = [
  "scheduled",
  "done",
  "missed",
  "rescheduled",
  "cancelled",
] as const;
export type ServiceVisitStatus = (typeof serviceVisitStatuses)[number];

export type PartUsed = { name: string; qty: number };

// ── Tables ───────────────────────────────────────────────────

/** The company or person who pays. */
export const clients = mysqlTable(
  "clients",
  {
    id: id(),
    name: varchar({ length: 150 }).notNull(),
    type: varchar({ length: 12 })
      .$type<ClientType>()
      .notNull()
      .default("company"),
    gstNo: varchar({ length: 15 }),
    segment: varchar({ length: 12 }).$type<ClientSegment>(),
    tags: json().$type<string[]>(),
    /** Where the client came from: referral, walk-in, field visit … */
    source: varchar({ length: 50 }),
    salesOwnerId: ref().references(() => employees.id),
    status: varchar({ length: 10 })
      .$type<ClientStatus>()
      .notNull()
      .default("active"),
    notes: text(),
    createdBy: ref().references(() => employees.id),
    ...timestamps(),
  },
  (t) => [
    index("clients_name_idx").on(t.name),
    index("clients_status_idx").on(t.status),
  ],
);

export const clientContacts = mysqlTable(
  "client_contacts",
  {
    id: id(),
    clientId: ref()
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    name: varchar({ length: 120 }).notNull(),
    designation: varchar({ length: 100 }),
    phone: phone().notNull(),
    altPhone: phone(),
    email: varchar({ length: 191 }),
    isPrimary: boolean().notNull().default(false),
    /** Automatic and bulk SMS are sent only when true. */
    smsOptIn: boolean().notNull().default(true),
    optedOutAt: dateTime(),
    ...timestamps(),
  },
  (t) => [index("client_contacts_phone_idx").on(t.phone)],
);

export const clientSites = mysqlTable(
  "client_sites",
  {
    id: id(),
    clientId: ref()
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    label: varchar({ length: 100 }),
    addressLine: varchar({ length: 255 }).notNull(),
    area: varchar({ length: 100 }),
    city: varchar({ length: 100 }),
    state: varchar({ length: 60 }),
    pincode: varchar({ length: 10 }),
    /** Used to flag field visits logged far from the site. */
    lat: coordinate(),
    lng: coordinate(),
    ...timestamps(),
  },
  (t) => [index("client_sites_city_area_idx").on(t.city, t.area)],
);

/** An RO plant installed at a client site. */
export const installations = mysqlTable(
  "installations",
  {
    id: id(),
    siteId: ref()
      .notNull()
      .references(() => clientSites.id),
    plantType: varchar({ length: 50 }),
    capacityLph: int({ unsigned: true }),
    model: varchar({ length: 100 }),
    serialNo: varchar({ length: 100 }),
    membraneSpec: varchar({ length: 150 }),
    /** Extra technical details as label → value. */
    specs: json().$type<Record<string, string>>(),
    installedOn: date({ mode: "string" }),
    installedBy: ref().references(() => employees.id),
    warrantyUntil: date({ mode: "string" }),
    status: varchar({ length: 10 })
      .$type<InstallationStatus>()
      .notNull()
      .default("active"),
    notes: text(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("installations_serial_no_uq").on(t.serialNo),
    index("installations_warranty_until_idx").on(t.warrantyUntil),
  ],
);

/** Annual Maintenance Contract on one installation. */
export const amcContracts = mysqlTable(
  "amc_contracts",
  {
    id: id(),
    contractNo: varchar({ length: 30 }).notNull(),
    installationId: ref()
      .notNull()
      .references(() => installations.id),
    plan: varchar({ length: 20 })
      .$type<AmcPlan>()
      .notNull()
      .default("comprehensive"),
    startOn: date({ mode: "string" }).notNull(),
    endOn: date({ mode: "string" }).notNull(),
    /** Service visits generated across the contract period. */
    visitsPerYear: tinyint({ unsigned: true }).notNull().default(4),
    filterChangeEveryDays: smallint({ unsigned: true }),
    membraneChangeEveryDays: smallint({ unsigned: true }),
    value: money().notNull().default("0.00"),
    amountPaid: money().notNull().default("0.00"),
    paymentStatus: varchar({ length: 10 })
      .$type<PaymentStatus>()
      .notNull()
      .default("unpaid"),
    status: varchar({ length: 10 })
      .$type<ContractStatus>()
      .notNull()
      .default("active"),
    /** Previous contract this one renews. */
    renewedFromId: ref().references((): AnyMySqlColumn => amcContracts.id),
    notes: text(),
    createdBy: ref().references(() => employees.id),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("amc_contracts_contract_no_uq").on(t.contractNo),
    index("amc_contracts_status_end_idx").on(t.status, t.endOn),
  ],
);

/** Breakdown / service request raised by a client. */
export const complaints = mysqlTable(
  "complaints",
  {
    id: id(),
    ticketNo: varchar({ length: 20 }).notNull(),
    installationId: ref()
      .notNull()
      .references(() => installations.id),
    /** Copied from the installation's site for quick listing and SMS. */
    clientId: ref()
      .notNull()
      .references(() => clients.id),
    issue: text().notNull(),
    priority: varchar({ length: 10 })
      .$type<ComplaintPriority>()
      .notNull()
      .default("normal"),
    status: varchar({ length: 12 })
      .$type<ComplaintStatus>()
      .notNull()
      .default("open"),
    assignedTo: ref().references(() => employees.id),
    /** Target resolution time. */
    dueBy: dateTime(),
    resolvedAt: dateTime(),
    closedAt: dateTime(),
    resolutionNotes: text(),
    createdBy: ref().references(() => employees.id),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("complaints_ticket_no_uq").on(t.ticketNo),
    index("complaints_status_priority_idx").on(t.status, t.priority),
  ],
);

/** A technician visit: scheduled AMC service, complaint fix, installation or paid call. */
export const serviceVisits = mysqlTable(
  "service_visits",
  {
    id: id(),
    installationId: ref()
      .notNull()
      .references(() => installations.id),
    contractId: ref().references(() => amcContracts.id),
    complaintId: ref().references(() => complaints.id),
    type: varchar({ length: 15 }).$type<ServiceVisitType>().notNull(),
    technicianId: ref().references(() => employees.id),
    dueOn: date({ mode: "string" }).notNull(),
    scheduledAt: dateTime(),
    doneAt: dateTime(),
    status: varchar({ length: 12 })
      .$type<ServiceVisitStatus>()
      .notNull()
      .default("scheduled"),
    notes: text(),
    partsUsed: json().$type<PartUsed[]>(),
    photoKey: fileKey(),
    /** Next service date worked out when this visit is marked done. */
    nextDueOn: date({ mode: "string" }),
    ...timestamps(),
  },
  (t) => [
    index("service_visits_status_due_idx").on(t.status, t.dueOn),
    index("service_visits_technician_due_idx").on(t.technicianId, t.dueOn),
  ],
);
