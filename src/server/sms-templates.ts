import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { smsTemplates } from "@/db/schema";
import { renderTemplate, sendSms, type SendSmsInput } from "@/lib/sms";

// Stable template keys used by app code. The seed script creates one
// template per key; admins can edit the wording (and switch any off) on the
// Messages → Templates screen without code changes.
export const TEMPLATE_KEYS = {
  contractCreated: "contract_created",
  serviceDue: "service_due",
  technicianAssigned: "technician_assigned",
  technicianJob: "technician_job",
  visitToday: "visit_today",
  serviceCompleted: "service_completed",
  filterChangeDue: "filter_change_due",
  amcRenewalDue: "amc_renewal_due",
  amcExpired: "amc_expired",
  paymentDue: "payment_due",
  complaintReceived: "complaint_received",
  complaintResolved: "complaint_resolved",
} as const;

export type TemplateKey = (typeof TEMPLATE_KEYS)[keyof typeof TEMPLATE_KEYS];

/**
 * Send an SMS from a template. Skips silently (returns null) when the
 * template is missing or switched off, so features keep working while
 * templates are being set up.
 */
export async function sendTemplated(
  key: TemplateKey,
  vars: Record<string, string | number>,
  target: Omit<SendSmsInput, "body" | "templateId">,
) {
  const tpl = await db.query.smsTemplates.findFirst({ where: eq(smsTemplates.key, key) });
  if (!tpl || !tpl.isActive) return null;
  return sendSms({ ...target, templateId: tpl.id, body: renderTemplate(tpl.body, vars) });
}
