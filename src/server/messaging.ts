import "server-only";

import { and, asc, desc, eq, gte, inArray, like, lt, type SQL } from "drizzle-orm";

import { db } from "@/db";
import {
  type ClientSegment,
  type ClientStatus,
  clientContacts,
  clients,
  clientSites,
  type SmsAudienceFilter,
  type SmsStatus,
  smsBatches,
  smsMessages,
  smsTemplates,
} from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { isValidPhone } from "@/lib/phone";
import { renderTemplate, sendSms } from "@/lib/sms";
import { addDays, formatDateTime, isoDateInTz, minutesOfDay, zonedMidnight } from "@/lib/time";

// Messages screen: demo inbox, message log, compose (single / segment /
// all clients, now or scheduled) and template editing.

// ── Inbox ────────────────────────────────────────────────────

export type Conversation = {
  phone: string;
  name: string | null;
  lastBody: string;
  lastAt: Date;
  lastStatus: SmsStatus;
  count: number;
};

/** Latest conversations, one per phone number, newest first. */
export async function getConversations(limit = 40): Promise<Conversation[]> {
  // Group the most recent messages in JS: simpler than a GROUP BY with a
  // "latest row per group" subquery, and the window is small.
  const rows = await db
    .select({
      phone: smsMessages.phone,
      body: smsMessages.body,
      status: smsMessages.status,
      createdAt: smsMessages.createdAt,
      clientName: clients.name,
    })
    .from(smsMessages)
    .leftJoin(clients, eq(clients.id, smsMessages.clientId))
    .orderBy(desc(smsMessages.createdAt), desc(smsMessages.id))
    .limit(1000);

  const byPhone = new Map<string, Conversation>();
  for (const r of rows) {
    const c = byPhone.get(r.phone);
    if (c) {
      c.count++;
      c.name ??= r.clientName;
    } else if (byPhone.size < limit) {
      byPhone.set(r.phone, {
        phone: r.phone,
        name: r.clientName,
        lastBody: r.body,
        lastAt: r.createdAt,
        lastStatus: r.status,
        count: 1,
      });
    }
  }
  return [...byPhone.values()];
}

/** Every message to one number, oldest first (chat order). */
export async function getThread(phone: string) {
  const rows = await db.query.smsMessages.findMany({
    where: eq(smsMessages.phone, phone),
    orderBy: [desc(smsMessages.createdAt), desc(smsMessages.id)],
    limit: 200,
    with: {
      client: { columns: { name: true } },
      employee: { columns: { name: true } },
      template: { columns: { name: true } },
    },
  });
  return rows.reverse();
}

// ── Log ──────────────────────────────────────────────────────

export type LogFilters = {
  status?: SmsStatus;
  templateId?: number;
  from?: string;
  to?: string;
  phone?: string;
};

export async function getMessageLog(f: LogFilters, tz: string) {
  const where: SQL[] = [];
  if (f.status) where.push(eq(smsMessages.status, f.status));
  if (f.templateId) where.push(eq(smsMessages.templateId, f.templateId));
  if (f.from) where.push(gte(smsMessages.createdAt, zonedMidnight(f.from, tz)));
  if (f.to) where.push(lt(smsMessages.createdAt, zonedMidnight(addDays(f.to, 1), tz)));
  // Partial match on the digits, so "98123" finds +919812345678.
  const digits = f.phone?.replace(/\D/g, "");
  if (digits) where.push(like(smsMessages.phone, `%${digits}%`));

  return db.query.smsMessages.findMany({
    where: where.length ? and(...where) : undefined,
    orderBy: [desc(smsMessages.createdAt), desc(smsMessages.id)],
    limit: 200,
    with: {
      client: { columns: { name: true } },
      contact: { columns: { name: true } },
      employee: { columns: { name: true } },
      template: { columns: { name: true, key: true } },
    },
  });
}

export async function allTemplates() {
  return db.select().from(smsTemplates).orderBy(asc(smsTemplates.name));
}

// ── Compose ──────────────────────────────────────────────────

/** Key of the hidden template that carries free-text messages. */
export const CUSTOM_TEMPLATE_KEY = "custom_message";

/**
 * sms_batches.template_id is required, so free text is sent through a
 * dedicated "{{message}}" template. It is created on first use and kept
 * inactive so it never shows in template pickers.
 */
async function customTemplateId(): Promise<number> {
  const existing = await db.query.smsTemplates.findFirst({
    where: eq(smsTemplates.key, CUSTOM_TEMPLATE_KEY),
    columns: { id: true },
  });
  if (existing) return existing.id;
  const [row] = await db
    .insert(smsTemplates)
    .values({
      key: CUSTOM_TEMPLATE_KEY,
      name: "Custom message (compose)",
      body: "{{message}}",
      variables: ["message", "client", "contact"],
      trigger: "manual",
      audience: "client",
      isActive: false,
    })
    .$returningId();
  return row.id;
}

export type Audience =
  | { kind: "client"; clientId: number }
  | { kind: "segment"; segment?: ClientSegment; city?: string; status?: ClientStatus }
  | { kind: "all" };

export type Recipient = {
  clientId: number;
  clientName: string;
  contactId: number;
  contactName: string;
  phone: string;
};

/**
 * One SMS recipient per client: the primary contact when it has opted in,
 * otherwise any opted-in contact. Clients with no opted-in contact (or no
 * valid number) are skipped.
 */
async function resolveRecipients(audience: Audience): Promise<Recipient[]> {
  const where: SQL[] = [eq(clientContacts.smsOptIn, true)];
  if (audience.kind === "client") {
    where.push(eq(clients.id, audience.clientId));
  } else if (audience.kind === "all") {
    where.push(eq(clients.status, "active"));
  } else {
    if (audience.segment) where.push(eq(clients.segment, audience.segment));
    if (audience.status) where.push(eq(clients.status, audience.status));
    if (audience.city) {
      where.push(
        inArray(
          clients.id,
          db.select({ id: clientSites.clientId }).from(clientSites).where(eq(clientSites.city, audience.city)),
        ),
      );
    }
  }

  const rows = await db
    .select({
      clientId: clients.id,
      clientName: clients.name,
      contactId: clientContacts.id,
      contactName: clientContacts.name,
      phone: clientContacts.phone,
      isPrimary: clientContacts.isPrimary,
    })
    .from(clients)
    .innerJoin(clientContacts, eq(clientContacts.clientId, clients.id))
    .where(and(...where))
    .orderBy(asc(clients.id), desc(clientContacts.isPrimary), asc(clientContacts.id));

  // Rows are sorted primary-first within each client, so the first wins.
  const picked = new Map<number, Recipient>();
  for (const r of rows) {
    if (picked.has(r.clientId) || !isValidPhone(r.phone)) continue;
    picked.set(r.clientId, {
      clientId: r.clientId,
      clientName: r.clientName,
      contactId: r.contactId,
      contactName: r.contactName,
      phone: r.phone,
    });
  }
  return [...picked.values()];
}

/** Distinct site cities, for the segment filter. */
export async function cityOptions() {
  const rows = await db
    .selectDistinct({ city: clientSites.city })
    .from(clientSites)
    .orderBy(asc(clientSites.city));
  return rows.flatMap((r) => (r.city ? [{ value: r.city, label: r.city }] : []));
}

/** Quiet hours: no SMS before 09:00 or after 20:00 local time. */
const QUIET_START_MIN = 9 * 60;
const QUIET_END_MIN = 20 * 60;

/** "2026-11-22T21:30" typed in the business timezone → UTC instant. */
export function parseLocalDateTime(value: string, tz: string): Date {
  const m = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!m) throw new Error("Pick a valid date and time.");
  return new Date(zonedMidnight(m[1], tz).getTime() + (Number(m[2]) * 60 + Number(m[3])) * 60_000);
}

/** Moves a time outside 09:00–20:00 local to the next 09:00. */
function applyQuietHours(at: Date, tz: string): { at: Date; moved: boolean } {
  const min = minutesOfDay(at, tz);
  if (min >= QUIET_START_MIN && min <= QUIET_END_MIN) return { at, moved: false };
  const day = isoDateInTz(at, tz);
  const target = min < QUIET_START_MIN ? day : addDays(day, 1);
  return { at: new Date(zonedMidnight(target, tz).getTime() + QUIET_START_MIN * 60_000), moved: true };
}

/** "offer=10% off\nvalid_till=30 Nov" → { offer: "10% off", valid_till: "30 Nov" } */
export function parseExtraVars(text: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of (text ?? "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const eqAt = line.indexOf("=");
    const key = eqAt > 0 ? line.slice(0, eqAt).trim() : "";
    if (!/^\w+$/.test(key)) {
      throw new Error(`Variable line "${line.trim()}" must look like name=value.`);
    }
    out[key] = line.slice(eqAt + 1).trim();
  }
  return out;
}

export type ComposeInput = {
  templateId: number | null;
  customText: string | null;
  audience: Audience;
  extraVars: Record<string, string>;
  /** Already parsed; null = send now. */
  scheduledAt: Date | null;
};

export async function composeAndSend(input: ComposeInput, actorId: number, tz: string) {
  let templateId: number;
  let body: string;
  let templateName: string;
  if (input.customText) {
    templateId = await customTemplateId();
    body = input.customText;
    templateName = "Custom message";
  } else {
    if (!input.templateId) throw new Error("Pick a template or write a message.");
    const tpl = await db.query.smsTemplates.findFirst({ where: eq(smsTemplates.id, input.templateId) });
    if (!tpl) throw new Error("Template not found.");
    if (!tpl.isActive) throw new Error("That template is switched off.");
    templateId = tpl.id;
    body = tpl.body;
    templateName = tpl.name;
  }

  let scheduledAt: Date | null = null;
  let movedForQuietHours = false;
  if (input.scheduledAt) {
    if (input.scheduledAt.getTime() < Date.now() - 60_000) {
      throw new Error("The scheduled time is in the past.");
    }
    const q = applyQuietHours(input.scheduledAt, tz);
    scheduledAt = q.at;
    movedForQuietHours = q.moved;
  }

  const recipients = await resolveRecipients(input.audience);
  if (!recipients.length) {
    throw new Error("No recipients: none of the selected clients has an opted-in contact with a valid number.");
  }

  const audienceFilter: SmsAudienceFilter = { kind: input.audience.kind };
  if (input.audience.kind === "client") audienceFilter.clientId = input.audience.clientId;
  if (input.audience.kind === "segment") {
    for (const k of ["segment", "city", "status"] as const) {
      const v = input.audience[k];
      if (v) audienceFilter[k] = v;
    }
  }

  const [batch] = await db
    .insert(smsBatches)
    .values({
      name: `${templateName} · ${formatDateTime(new Date(), tz)}`,
      templateId,
      audienceFilter,
      variables: input.customText ? { ...input.extraVars, message: input.customText } : input.extraVars,
      scheduledAt,
      status: scheduledAt ? "scheduled" : "sending",
      recipientCount: recipients.length,
      createdBy: actorId,
    })
    .$returningId();

  const tally = { delivered: 0, failed: 0, queued: 0 };
  for (const r of recipients) {
    const text = renderTemplate(body, {
      ...input.extraVars,
      client: r.clientName,
      contact: r.contactName,
    });
    const res = await sendSms({
      phone: r.phone,
      body: text,
      templateId,
      batchId: batch.id,
      clientId: r.clientId,
      contactId: r.contactId,
      refType: "sms_batch",
      refId: batch.id,
      scheduledAt,
    });
    if (res.status === "delivered") tally.delivered++;
    else if (res.status === "failed") tally.failed++;
    else tally.queued++;
  }

  // Scheduled batches stay "scheduled"; the cron job sends their messages.
  if (!scheduledAt) {
    await db.update(smsBatches).set({ status: "sent" }).where(eq(smsBatches.id, batch.id));
  }
  await logAudit({
    actorId,
    tableName: "sms_batches",
    recordId: batch.id,
    action: "create",
    after: { templateId, audienceFilter, recipientCount: recipients.length, scheduledAt },
  });

  return { batchId: batch.id, recipients: recipients.length, scheduledAt, movedForQuietHours, ...tally };
}

// ── Templates ────────────────────────────────────────────────

export async function updateTemplate(
  id: number,
  data: { name: string; body: string; offsetDays: number[] | null; isActive: boolean },
  actorId: number,
) {
  const before = await db.query.smsTemplates.findFirst({ where: eq(smsTemplates.id, id) });
  if (!before) throw new Error("Template not found.");
  // Keep the variable list in step with the placeholders actually used.
  const used = [...data.body.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]);
  const variables = [...new Set([...before.variables, ...used])];
  await db.update(smsTemplates).set({ ...data, variables }).where(eq(smsTemplates.id, id));
  await logAudit({
    actorId,
    tableName: "sms_templates",
    recordId: id,
    action: "update",
    before: { name: before.name, body: before.body, offsetDays: before.offsetDays, isActive: before.isActive },
    after: data,
  });
}

export async function setTemplateActive(id: number, isActive: boolean, actorId: number) {
  await db.update(smsTemplates).set({ isActive }).where(eq(smsTemplates.id, id));
  await logAudit({ actorId, tableName: "sms_templates", recordId: id, action: "update", after: { isActive } });
}
