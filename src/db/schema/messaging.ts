import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  int,
  mysqlTable,
  text,
  tinyint,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

import {
  dateTime,
  id,
  json,
  phone,
  ref,
  timestamps,
} from "./columns";
import { clientContacts, clients } from "./clients";
import { employees } from "./people";

// ── Value sets ───────────────────────────────────────────────

/** What makes a template send automatically ("manual" = admin only). */
export const smsTriggers = [
  "manual",
  "contract_created",
  "service_due",
  "technician_assigned",
  "visit_today",
  "service_completed",
  "filter_change_due",
  "amc_renewal_due",
  "amc_expired",
  "payment_due",
  "complaint_received",
  "complaint_resolved",
] as const;
export type SmsTrigger = (typeof smsTriggers)[number];

export const smsAudiences = [
  "client",
  "technician",
  "client_and_technician",
] as const;
export type SmsAudience = (typeof smsAudiences)[number];

export const smsBatchStatuses = [
  "draft",
  "scheduled",
  "sending",
  "sent",
  "cancelled",
] as const;
export type SmsBatchStatus = (typeof smsBatchStatuses)[number];

/** demo = built-in mock gateway (this phase); live = real provider (later). */
export const smsProviders = ["demo", "live"] as const;
export type SmsProvider = (typeof smsProviders)[number];

export const smsStatuses = [
  "queued",
  "sent",
  "delivered",
  "failed",
  "cancelled",
] as const;
export type SmsStatus = (typeof smsStatuses)[number];

/** Filters for a bulk send, e.g. { segment: "industrial", city: "Delhi" }. */
export type SmsAudienceFilter = Record<string, string | number | boolean>;

// ── Tables ───────────────────────────────────────────────────

export const smsTemplates = mysqlTable(
  "sms_templates",
  {
    id: id(),
    /** Stable code used by the app, e.g. "service_due". */
    key: varchar({ length: 50 }).notNull(),
    name: varchar({ length: 100 }).notNull(),
    /** Text with {{placeholders}}, e.g. "Dear {{client}}, service due on {{date}}". */
    body: text().notNull(),
    variables: json().$type<string[]>().notNull(),
    trigger: varchar({ length: 30 })
      .$type<SmsTrigger>()
      .notNull()
      .default("manual"),
    /** Days before the event to send, e.g. [7, 3]. Null = send on the event. */
    offsetDays: json().$type<number[]>(),
    audience: varchar({ length: 25 })
      .$type<SmsAudience>()
      .notNull()
      .default("client"),
    /** Template ID registered with the live provider / DLT (later phase). */
    providerTemplateId: varchar({ length: 50 }),
    isActive: boolean().notNull().default(true),
    ...timestamps(),
  },
  (t) => [uniqueIndex("sms_templates_key_uq").on(t.key)],
);

/** A manual or scheduled bulk send composed by an admin. */
export const smsBatches = mysqlTable(
  "sms_batches",
  {
    id: id(),
    name: varchar({ length: 150 }).notNull(),
    templateId: ref()
      .notNull()
      .references(() => smsTemplates.id),
    audienceFilter: json().$type<SmsAudienceFilter>(),
    /** Values for placeholders that are the same for every recipient. */
    variables: json().$type<Record<string, string>>(),
    scheduledAt: dateTime(),
    status: varchar({ length: 10 })
      .$type<SmsBatchStatus>()
      .notNull()
      .default("draft"),
    recipientCount: int({ unsigned: true }).notNull().default(0),
    createdBy: ref().references(() => employees.id),
    ...timestamps(),
  },
  (t) => [index("sms_batches_status_scheduled_idx").on(t.status, t.scheduledAt)],
);

/** Every SMS, automatic or manual, with its delivery status. */
export const smsMessages = mysqlTable(
  "sms_messages",
  {
    id: id(),
    templateId: ref().references(() => smsTemplates.id),
    batchId: ref().references(() => smsBatches.id),
    clientId: ref().references(() => clients.id),
    contactId: ref().references(() => clientContacts.id),
    /** Set when the recipient is a technician. */
    employeeId: ref().references(() => employees.id),
    phone: phone().notNull(),
    body: text().notNull(),
    /** What the message is about, e.g. "service_visit" + its id. */
    refType: varchar({ length: 30 }),
    refId: ref(),
    /** Prevents sending the same reminder twice, e.g. "service_due:visit:42:7". */
    dedupeKey: varchar({ length: 150 }),
    provider: varchar({ length: 10 }).$type<SmsProvider>().notNull(),
    providerMsgId: varchar({ length: 100 }),
    status: varchar({ length: 10 })
      .$type<SmsStatus>()
      .notNull()
      .default("queued"),
    error: varchar({ length: 255 }),
    attempts: tinyint({ unsigned: true }).notNull().default(0),
    scheduledAt: dateTime().notNull().default(sql`CURRENT_TIMESTAMP(3)`),
    sentAt: dateTime(),
    deliveredAt: dateTime(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("sms_messages_dedupe_key_uq").on(t.dedupeKey),
    index("sms_messages_status_scheduled_idx").on(t.status, t.scheduledAt),
    index("sms_messages_client_created_idx").on(t.clientId, t.createdAt),
    // Demo inbox groups and opens conversations by phone number.
    index("sms_messages_phone_created_idx").on(t.phone, t.createdAt),
    index("sms_messages_ref_idx").on(t.refType, t.refId),
    index("sms_messages_provider_msg_idx").on(t.providerMsgId),
  ],
);
