import { index, mysqlTable, varchar } from "drizzle-orm/mysql-core";

import {
  createdAt,
  id,
  json,
  ref,
  timestamps,
} from "./columns";
import { employees } from "./people";

export const auditActions = ["create", "update", "delete"] as const;
export type AuditAction = (typeof auditActions)[number];

/** Who changed what, when and why: every manual edit and approval. */
export const auditLog = mysqlTable(
  "audit_log",
  {
    id: id(),
    /** Null for changes made by scheduled jobs. */
    actorId: ref().references(() => employees.id),
    tableName: varchar({ length: 64 }).notNull(),
    recordId: ref().notNull(),
    action: varchar({ length: 10 }).$type<AuditAction>().notNull(),
    before: json().$type<Record<string, unknown>>(),
    after: json().$type<Record<string, unknown>>(),
    reason: varchar({ length: 255 }),
    ip: varchar({ length: 45 }),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_log_record_idx").on(t.tableName, t.recordId),
    index("audit_log_actor_created_idx").on(t.actorId, t.createdAt),
  ],
);

/**
 * Admin-editable settings, one JSON value per key. Examples:
 * "sms.quietHours" → { from: "20:00", to: "09:00" },
 * "visits.farFromSiteM" → 500, "attendance.maxGpsAccuracyM" → 100.
 */
export const appSettings = mysqlTable("app_settings", {
  key: varchar({ length: 100 }).primaryKey(),
  value: json().$type<unknown>().notNull(),
  updatedBy: ref().references(() => employees.id),
  updatedAt: timestamps().updatedAt,
});
