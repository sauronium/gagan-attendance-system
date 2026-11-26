import "server-only";

import { and, eq, lte } from "drizzle-orm";

import { db } from "@/db";
import { smsMessages } from "@/db/schema";
import { env } from "@/lib/env";

// SMS adapter. Everything that sends a text goes through sendSms(), which
// stores the message in sms_messages and hands it to the provider:
// - demo (this phase): nothing leaves the server; the message is marked
//   sent → delivered (or failed, at SMS_DEMO_FAILURE_RATE) and appears in
//   the admin "Demo SMS inbox".
// - live (later): POSTs to SMS_API_URL with SMS_API_KEY. Swap in a real
//   provider's request shape in deliverLive() when one is chosen.

export type SendSmsInput = {
  phone: string;
  body: string;
  templateId?: number | null;
  batchId?: number | null;
  clientId?: number | null;
  contactId?: number | null;
  employeeId?: number | null;
  refType?: string | null;
  refId?: number | null;
  /** Same key twice = second call is skipped (no duplicate reminders). */
  dedupeKey?: string | null;
  /** Future time = queue it; the cron job sends it when due. */
  scheduledAt?: Date | null;
};

type DeliveryResult =
  | { ok: true; providerMsgId: string }
  | { ok: false; error: string };

async function deliverDemo(): Promise<DeliveryResult> {
  if (Math.random() < env.sms.demoFailureRate) {
    return { ok: false, error: "Simulated delivery failure (demo)" };
  }
  return {
    ok: true,
    providerMsgId: `demo_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
  };
}

async function deliverLive(phone: string, body: string): Promise<DeliveryResult> {
  if (!env.sms.apiUrl || !env.sms.apiKey) {
    return { ok: false, error: "Live SMS provider is not configured" };
  }
  try {
    const res = await fetch(env.sms.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.sms.apiKey}`,
      },
      body: JSON.stringify({ to: phone, sender: env.sms.senderId, message: body }),
    });
    if (!res.ok) return { ok: false, error: `Provider returned ${res.status}` };
    const json = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, providerMsgId: json.id ?? "" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
}

function deliver(phone: string, body: string) {
  return env.sms.provider === "live" ? deliverLive(phone, body) : deliverDemo();
}

async function markResult(id: number, result: DeliveryResult, attempts: number) {
  const now = new Date();
  await db
    .update(smsMessages)
    .set(
      result.ok
        ? {
            status: "delivered",
            providerMsgId: result.providerMsgId,
            sentAt: now,
            // Demo: pretend the handset confirmed a couple of seconds later.
            deliveredAt: new Date(now.getTime() + 2000),
            error: null,
            attempts,
          }
        : { status: "failed", error: result.error, sentAt: now, attempts },
    )
    .where(eq(smsMessages.id, id));
}

export async function sendSms(
  input: SendSmsInput,
): Promise<{ id: number; status: "queued" | "delivered" | "failed" | "skipped" }> {
  if (input.dedupeKey) {
    const existing = await db.query.smsMessages.findFirst({
      where: eq(smsMessages.dedupeKey, input.dedupeKey),
      columns: { id: true },
    });
    if (existing) return { id: existing.id, status: "skipped" };
  }

  const scheduledAt = input.scheduledAt ?? new Date();
  const [row] = await db
    .insert(smsMessages)
    .values({
      phone: input.phone,
      body: input.body,
      templateId: input.templateId ?? null,
      batchId: input.batchId ?? null,
      clientId: input.clientId ?? null,
      contactId: input.contactId ?? null,
      employeeId: input.employeeId ?? null,
      refType: input.refType ?? null,
      refId: input.refId ?? null,
      dedupeKey: input.dedupeKey ?? null,
      provider: env.sms.provider,
      status: "queued",
      scheduledAt,
    })
    .$returningId();

  if (scheduledAt.getTime() > Date.now() + 30_000) {
    return { id: row.id, status: "queued" };
  }
  const result = await deliver(input.phone, input.body);
  await markResult(row.id, result, 1);
  return { id: row.id, status: result.ok ? "delivered" : "failed" };
}

/** Retry one failed message (admin "Resend" button). */
export async function resendSms(id: number) {
  const msg = await db.query.smsMessages.findFirst({ where: eq(smsMessages.id, id) });
  if (!msg) throw new Error("Message not found");
  const result = await deliver(msg.phone, msg.body);
  await markResult(id, result, msg.attempts + 1);
  return result.ok;
}

/** Send queued messages whose time has come. Called by the cron job. */
export async function processDueSms(limit = 200): Promise<number> {
  const due = await db.query.smsMessages.findMany({
    where: and(eq(smsMessages.status, "queued"), lte(smsMessages.scheduledAt, new Date())),
    limit,
  });
  let sent = 0;
  for (const msg of due) {
    // Claim the row first so two overlapping runs (daily job + the frequent
    // SMS job) never send the same message twice.
    const [claim] = await db
      .update(smsMessages)
      .set({ status: "sent" })
      .where(and(eq(smsMessages.id, msg.id), eq(smsMessages.status, "queued")));
    if (claim.affectedRows !== 1) continue;
    const result = await deliver(msg.phone, msg.body);
    await markResult(msg.id, result, msg.attempts + 1);
    sent++;
  }
  return sent;
}

const toCamel = (k: string) => k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const toSnake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/**
 * Fill {{placeholders}} in a template body. {{contractNo}} and {{contract_no}}
 * are treated as the same name, so edited templates work with either style.
 * Unknown placeholders are left visible.
 */
export function renderTemplate(body: string, vars: Record<string, string | number>) {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, key: string) => {
    for (const k of [key, toCamel(key), toSnake(key)]) if (k in vars) return String(vars[k]);
    return m;
  });
}
