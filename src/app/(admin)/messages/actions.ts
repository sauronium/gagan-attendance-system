"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { clientSegments, clientStatuses } from "@/db/schema";
import { type ActionState, actionError, formToObject, zf } from "@/lib/action";
import { logAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { ADMIN_ROLES } from "@/lib/roles";
import { assertViewer } from "@/lib/session";
import { resendSms } from "@/lib/sms";
import { formatDateTime } from "@/lib/time";
import {
  type Audience,
  composeAndSend,
  parseExtraVars,
  parseLocalDateTime,
  setTemplateActive,
  updateTemplate,
} from "@/server/messaging";

function refresh() {
  revalidatePath("/messages");
  revalidatePath("/dashboard");
}

export async function resendAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(ADMIN_ROLES);
    const id = z.coerce.number().int().positive().parse(fd.get("id"));
    const ok = await resendSms(id);
    await logAudit({
      actorId: viewer.employee.id,
      tableName: "sms_messages",
      recordId: id,
      action: "update",
      after: { resent: true, delivered: ok },
    });
    refresh();
    return ok
      ? { ok: true, message: "Message resent and delivered." }
      : { ok: false, error: "Resend failed again. Check the error in the log." };
  } catch (e) {
    return actionError(e);
  }
}

const composeSchema = z
  .object({
    mode: z.enum(["template", "custom"]),
    templateId: zf.optId(),
    customText: zf.optText(640),
    audience: z.enum(["client", "segment", "all"]),
    clientId: zf.optId(),
    segment: z.enum(clientSegments).optional(),
    city: zf.optText(100),
    status: z.enum(clientStatuses).optional(),
    vars: zf.optText(2000),
    scheduledAt: z.string().optional(),
  })
  .superRefine((d, ctx) => {
    if (d.mode === "template" && !d.templateId) {
      ctx.addIssue({ code: "custom", path: ["templateId"], message: "Pick a template" });
    }
    if (d.mode === "custom" && !d.customText) {
      ctx.addIssue({ code: "custom", path: ["customText"], message: "Write the message" });
    }
    if (d.audience === "client" && !d.clientId) {
      ctx.addIssue({ code: "custom", path: ["clientId"], message: "Pick a client" });
    }
  });

export async function composeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(ADMIN_ROLES);
    const d = composeSchema.parse(formToObject(fd));
    const tz = env.timezone;

    let extraVars: Record<string, string>;
    try {
      extraVars = parseExtraVars(d.vars);
    } catch (e) {
      return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: { vars: (e as Error).message } };
    }

    const audience: Audience =
      d.audience === "client"
        ? { kind: "client", clientId: d.clientId! }
        : d.audience === "segment"
          ? { kind: "segment", segment: d.segment, city: d.city, status: d.status }
          : { kind: "all" };

    const res = await composeAndSend(
      {
        templateId: d.mode === "template" ? d.templateId! : null,
        customText: d.mode === "custom" ? d.customText! : null,
        audience,
        extraVars,
        scheduledAt: d.scheduledAt ? parseLocalDateTime(d.scheduledAt, tz) : null,
      },
      viewer.employee.id,
      tz,
    );
    refresh();

    const who = `${res.recipients} recipient${res.recipients === 1 ? "" : "s"}`;
    if (res.scheduledAt) {
      const when = formatDateTime(res.scheduledAt, tz);
      return {
        ok: true,
        message: res.movedForQuietHours
          ? `Scheduled for ${who} at ${when} (moved to 9:00 AM because of quiet hours, 8 PM–9 AM).`
          : `Scheduled for ${who} at ${when}.`,
      };
    }
    return {
      ok: true,
      message: `Sent to ${who}: ${res.delivered} delivered${res.failed ? `, ${res.failed} failed` : ""}.`,
    };
  } catch (e) {
    return actionError(e);
  }
}

/** "7,3" → [7, 3]; blank → null. */
const offsetsSchema = z
  .string()
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    const parts = v.split(/[\s,]+/).filter(Boolean);
    const nums = parts.map(Number);
    if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 365)) {
      ctx.addIssue({ code: "custom", message: "Use whole days, e.g. 7,3" });
      return z.NEVER;
    }
    return [...new Set(nums)].sort((a, b) => b - a);
  });

export async function updateTemplateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(["super_admin"]);
    const d = z
      .object({
        id: zf.id(),
        name: zf.text(100),
        body: zf.text(640),
        offsetDays: offsetsSchema,
        isActive: zf.bool(),
      })
      .parse(formToObject(fd));
    await updateTemplate(d.id, d, viewer.employee.id);
    refresh();
    return { ok: true, message: `Template "${d.name}" saved.` };
  } catch (e) {
    return actionError(e);
  }
}

export async function toggleTemplateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(["super_admin"]);
    const { id, active } = z.object({ id: zf.id(), active: zf.bool() }).parse(formToObject(fd));
    await setTemplateActive(id, active, viewer.employee.id);
    refresh();
    return { ok: true, message: active ? "Template switched on." : "Template switched off." };
  } catch (e) {
    return actionError(e);
  }
}
