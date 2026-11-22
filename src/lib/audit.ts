import "server-only";

import { db } from "@/db";
import { type AuditAction, auditLog } from "@/db/schema";

/** Record who changed what and why. Never throws: auditing must not block the change. */
export async function logAudit(entry: {
  actorId: number | null;
  tableName: string;
  recordId: number;
  action: AuditAction;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string | null;
}) {
  try {
    await db.insert(auditLog).values({
      actorId: entry.actorId,
      tableName: entry.tableName,
      recordId: entry.recordId,
      action: entry.action,
      before: entry.before ?? null,
      after: entry.after ?? null,
      reason: entry.reason ?? null,
    });
  } catch (e) {
    console.error("audit log write failed", e);
  }
}
