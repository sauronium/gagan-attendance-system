import "server-only";

import { and, eq, inArray, isNotNull, isNull, lt, lte, ne } from "drizzle-orm";

import { db } from "@/db";
import {
  amcContracts,
  attendance,
  employees,
  holidays,
  serviceVisits,
  shifts,
  smsTemplates,
} from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { formatPhone, isValidPhone } from "@/lib/phone";
import { processDueSms } from "@/lib/sms";
import { addDays, daysBetween, formatDate, todayIso, weekdayIndex } from "@/lib/time";
import { runLeaveAccruals } from "@/server/leave-accrual";
import { sendTemplated, TEMPLATE_KEYS, type TemplateKey } from "@/server/sms-templates";

// Daily scheduled job (GET/POST /api/cron/daily, ideally ~9:00 AM local):
//   a) close yesterday's attendance (week off / holiday / absent / missed punch)
//   b) leave credits: yearly quota, monthly accrual, year-end carry forward
//   c) queue reminder SMS (service due, visit today, filter change, AMC
//      renewal / expiry, payment)
//   d) send queued SMS whose time has come (also every few minutes via
//      /api/cron/sms, so scheduled messages go out on time)
// Every step is idempotent: attendance uses the (employee, date) unique key,
// leave credits are checked against the adjustments ledger and reminders use
// sms_messages.dedupe_key, so running twice is harmless.

type Contact = { id: number; name: string; phone: string; isPrimary: boolean; smsOptIn: boolean };

/** Primary contact if opted in, else any opted-in contact with a valid number. */
function pickContact(contacts: Contact[] | undefined): Contact | null {
  const ok = (contacts ?? []).filter((c) => c.smsOptIn && isValidPhone(c.phone));
  return ok.find((c) => c.isPrimary) ?? ok[0] ?? null;
}

type Counter = { sent: number; skipped: number; failed: number };
const counter = (): Counter => ({ sent: 0, skipped: 0, failed: 0 });

/** sendTemplated with counting; never throws, so one bad row can't stop the job. */
async function remind(
  c: Counter,
  key: TemplateKey,
  vars: Record<string, string | number>,
  target: Parameters<typeof sendTemplated>[2],
) {
  try {
    const res = await sendTemplated(key, vars, target);
    // null = template missing or switched off; "skipped" = already sent (dedupe).
    if (!res || res.status === "skipped") c.skipped++;
    else if (res.status === "failed") c.failed++;
    else c.sent++;
  } catch (e) {
    console.error(`cron: ${key} reminder failed`, e);
    c.failed++;
  }
}

// ── a) Attendance ────────────────────────────────────────────

async function closeAttendanceDay(day: string) {
  const summary = { weekOff: 0, holiday: 0, absent: 0, missedPunch: 0 };

  const staff = await db
    .select({
      id: employees.id,
      shiftId: employees.shiftId,
      joinedOn: employees.joinedOn,
      leftOn: employees.leftOn,
      weeklyOffs: shifts.weeklyOffs,
    })
    .from(employees)
    .leftJoin(shifts, eq(shifts.id, employees.shiftId))
    .where(ne(employees.status, "inactive"));

  const [existing, holiday] = await Promise.all([
    db.select({ employeeId: attendance.employeeId }).from(attendance).where(eq(attendance.date, day)),
    db.query.holidays.findFirst({
      where: and(eq(holidays.date, day), eq(holidays.isOptional, false)),
      columns: { id: true },
    }),
  ]);
  const hasRow = new Set(existing.map((r) => r.employeeId));
  const weekday = weekdayIndex(day);

  for (const e of staff) {
    if (hasRow.has(e.id)) continue;
    // Not employed on that day.
    if ((e.joinedOn && e.joinedOn > day) || (e.leftOn && e.leftOn < day)) continue;

    const offs = e.weeklyOffs ?? [0];
    const status = offs.includes(weekday) ? "week_off" : holiday ? "holiday" : "absent";
    // Insert-or-ignore: a check-in that lands meanwhile keeps its own row.
    const [res] = await db
      .insert(attendance)
      .values({ employeeId: e.id, date: day, shiftId: e.shiftId, status, flags: { autoMarked: true } })
      .onDuplicateKeyUpdate({ set: { employeeId: e.id } });
    if (res.affectedRows === 1) {
      if (status === "week_off") summary.weekOff++;
      else if (status === "holiday") summary.holiday++;
      else summary.absent++;
    }
  }

  // Checked in but never checked out → missed punch.
  const open = await db
    .select({ id: attendance.id, status: attendance.status, flags: attendance.flags })
    .from(attendance)
    .where(
      and(
        eq(attendance.date, day),
        isNotNull(attendance.checkInAt),
        isNull(attendance.checkOutAt),
        ne(attendance.status, "missed_punch"),
      ),
    );
  for (const row of open) {
    await db
      .update(attendance)
      .set({ status: "missed_punch", flags: { ...(row.flags ?? {}), autoMarked: true } })
      .where(eq(attendance.id, row.id));
    await logAudit({
      actorId: null,
      tableName: "attendance",
      recordId: row.id,
      action: "update",
      before: { status: row.status },
      after: { status: "missed_punch" },
      reason: "No check-out recorded (daily job)",
    });
    summary.missedPunch++;
  }
  return summary;
}

// ── b) Reminders ─────────────────────────────────────────────

/** Built-in timings, used when a template has no offsetDays of its own. */
const DEFAULT_OFFSETS: Partial<Record<TemplateKey, number[]>> = {
  service_due: [7, 3],
  visit_today: [0],
  technician_job: [0],
  amc_renewal_due: [30, 15, 7],
  payment_due: [15],
  filter_change_due: [7],
};

async function templateOffsets(): Promise<Map<string, number[]>> {
  const rows = await db.select({ key: smsTemplates.key, offsetDays: smsTemplates.offsetDays }).from(smsTemplates);
  const map = new Map<string, number[]>();
  for (const [key, def] of Object.entries(DEFAULT_OFFSETS)) map.set(key, def);
  for (const r of rows) if (r.offsetDays?.length) map.set(r.key, r.offsetDays);
  return map;
}

/** Relations needed to reach a client's contacts and site address from an installation. */
const installationWith = {
  columns: { id: true, model: true },
  with: {
    site: {
      columns: { addressLine: true, area: true, city: true },
      with: {
        client: {
          columns: { id: true, name: true },
          with: {
            contacts: { columns: { id: true, name: true, phone: true, isPrimary: true, smsOptIn: true } },
          },
        },
      },
    },
  },
} as const;

const siteAddress = (s: { addressLine: string; area: string | null; city: string | null }) =>
  [s.addressLine, s.area, s.city].filter(Boolean).join(", ");

async function sendDailyReminders(today: string) {
  const offsets = await templateOffsets();
  const off = (key: TemplateKey) => offsets.get(key) ?? [];
  const out = {
    serviceDue: counter(),
    visitToday: counter(),
    technicianJob: counter(),
    amcRenewal: counter(),
    amcExpired: counter(),
    paymentDue: counter(),
    filterChange: counter(),
  };

  // Service visits that are still scheduled, due on any day we remind for.
  const serviceDays = new Map<string, { key: TemplateKey; offset: number }[]>();
  const addDay = (key: TemplateKey, offset: number) => {
    const d = addDays(today, offset);
    serviceDays.set(d, [...(serviceDays.get(d) ?? []), { key, offset }]);
  };
  for (const o of off(TEMPLATE_KEYS.serviceDue)) addDay(TEMPLATE_KEYS.serviceDue, o);
  for (const o of off(TEMPLATE_KEYS.visitToday)) addDay(TEMPLATE_KEYS.visitToday, o);
  for (const o of off(TEMPLATE_KEYS.technicianJob)) addDay(TEMPLATE_KEYS.technicianJob, o);

  if (serviceDays.size) {
    const visits = await db.query.serviceVisits.findMany({
      where: and(eq(serviceVisits.status, "scheduled"), inArray(serviceVisits.dueOn, [...serviceDays.keys()])),
      with: {
        installation: installationWith,
        technician: { columns: { id: true, name: true, mobile: true } },
      },
    });

    for (const v of visits) {
      const site = v.installation.site;
      const client = site.client;
      const contact = pickContact(client.contacts);
      const tech = v.technician;
      const vars = {
        client: client.name,
        contact: contact?.name ?? client.name,
        contactPhone: contact ? formatPhone(contact.phone) : "",
        date: formatDate(v.dueOn),
        dueDate: formatDate(v.dueOn),
        technician: tech?.name ?? "our technician",
        technicianPhone: tech ? formatPhone(tech.mobile) : "",
        address: siteAddress(site),
        model: v.installation.model ?? "RO plant",
      };

      for (const { key, offset } of serviceDays.get(v.dueOn) ?? []) {
        const dedupeKey = `${key}:${v.id}:${offset}`;
        const ref = { refType: "service_visit", refId: v.id, dedupeKey };
        if (key === TEMPLATE_KEYS.technicianJob) {
          if (tech && isValidPhone(tech.mobile)) {
            await remind(out.technicianJob, key, { ...vars, days: offset }, { phone: tech.mobile, employeeId: tech.id, clientId: client.id, ...ref });
          }
        } else if (contact) {
          await remind(
            key === TEMPLATE_KEYS.serviceDue ? out.serviceDue : out.visitToday,
            key,
            { ...vars, days: offset },
            { phone: contact.phone, clientId: client.id, contactId: contact.id, ...ref },
          );
        }
      }
    }
  }

  // AMC renewals: active contracts ending in N days.
  const renewalDays = new Map(off(TEMPLATE_KEYS.amcRenewalDue).map((o) => [addDays(today, o), o]));
  if (renewalDays.size) {
    const ending = await db.query.amcContracts.findMany({
      where: and(eq(amcContracts.status, "active"), inArray(amcContracts.endOn, [...renewalDays.keys()])),
      with: { installation: installationWith },
    });
    for (const c of ending) {
      const client = c.installation.site.client;
      const contact = pickContact(client.contacts);
      if (!contact) continue;
      const offset = renewalDays.get(c.endOn) ?? 0;
      await remind(
        out.amcRenewal,
        TEMPLATE_KEYS.amcRenewalDue,
        { client: client.name, contact: contact.name, contractNo: c.contractNo, date: formatDate(c.endOn), endDate: formatDate(c.endOn), days: offset },
        { phone: contact.phone, clientId: client.id, contactId: contact.id, refType: "amc_contract", refId: c.id, dedupeKey: `amc_renewal_due:${c.id}:${offset}` },
      );
    }
  }

  // Filter change: every `filterChangeEveryDays` from the contract start,
  // within the contract period. Reminded N days before each change date.
  const filterOffsets = off(TEMPLATE_KEYS.filterChangeDue);
  if (filterOffsets.length) {
    const withFilters = await db.query.amcContracts.findMany({
      where: and(eq(amcContracts.status, "active"), isNotNull(amcContracts.filterChangeEveryDays)),
      with: { installation: installationWith },
    });
    for (const c of withFilters) {
      const every = c.filterChangeEveryDays ?? 0;
      if (every <= 0) continue;
      const client = c.installation.site.client;
      const contact = pickContact(client.contacts);
      if (!contact) continue;
      for (const offset of filterOffsets) {
        const changeOn = addDays(today, offset);
        const sinceStart = daysBetween(c.startOn, changeOn);
        if (sinceStart <= 0 || sinceStart % every !== 0 || changeOn > c.endOn) continue;
        await remind(
          out.filterChange,
          TEMPLATE_KEYS.filterChangeDue,
          { client: client.name, contact: contact.name, contractNo: c.contractNo, date: formatDate(changeOn), days: offset, model: c.installation.model ?? "RO plant" },
          { phone: contact.phone, clientId: client.id, contactId: contact.id, refType: "amc_contract", refId: c.id, dedupeKey: `filter_change_due:${c.id}:${changeOn}:${offset}` },
        );
      }
    }
  }

  // Contracts past their end date and still active → expired (+ SMS). Using
  // "on or before yesterday" rather than "= yesterday" catches days the job missed.
  const yesterday = addDays(today, -1);
  const expired = await db.query.amcContracts.findMany({
    where: and(eq(amcContracts.status, "active"), lte(amcContracts.endOn, yesterday)),
    with: { installation: installationWith },
  });
  for (const c of expired) {
    await db.update(amcContracts).set({ status: "expired" }).where(eq(amcContracts.id, c.id));
    await logAudit({
      actorId: null,
      tableName: "amc_contracts",
      recordId: c.id,
      action: "update",
      before: { status: "active" },
      after: { status: "expired" },
      reason: `Contract ended ${formatDate(c.endOn)} (daily job)`,
    });
    const client = c.installation.site.client;
    const contact = pickContact(client.contacts);
    if (!contact) continue;
    await remind(
      out.amcExpired,
      TEMPLATE_KEYS.amcExpired,
      { client: client.name, contact: contact.name, contractNo: c.contractNo, date: formatDate(c.endOn), endDate: formatDate(c.endOn) },
      { phone: contact.phone, clientId: client.id, contactId: contact.id, refType: "amc_contract", refId: c.id, dedupeKey: `amc_expired:${c.id}` },
    );
  }

  // Payment pending N days after the contract was created: one reminder per contract.
  const payAfterDays = off(TEMPLATE_KEYS.paymentDue)[0] ?? 15;
  const cutoff = new Date(Date.now() - payAfterDays * 86_400_000);
  const unpaid = await db.query.amcContracts.findMany({
    where: and(
      inArray(amcContracts.paymentStatus, ["unpaid", "partial"]),
      inArray(amcContracts.status, ["active", "expired"]),
      lt(amcContracts.createdAt, cutoff),
    ),
    with: { installation: installationWith },
  });
  for (const c of unpaid) {
    const client = c.installation.site.client;
    const contact = pickContact(client.contacts);
    if (!contact) continue;
    const due = Math.max(0, Number(c.value) - Number(c.amountPaid));
    if (due <= 0) continue;
    await remind(
      out.paymentDue,
      TEMPLATE_KEYS.paymentDue,
      {
        client: client.name,
        contact: contact.name,
        contractNo: c.contractNo,
        amount: `₹${due.toLocaleString("en-IN")}`,
        amountDue: `₹${due.toLocaleString("en-IN")}`,
        value: `₹${Number(c.value).toLocaleString("en-IN")}`,
      },
      { phone: contact.phone, clientId: client.id, contactId: contact.id, refType: "amc_contract", refId: c.id, dedupeKey: `payment_due:${c.id}` },
    );
  }

  return out;
}

// ── Entry point ──────────────────────────────────────────────

export async function runDailyJobs() {
  const startedAt = new Date();
  const tz = env.timezone;
  const today = todayIso(tz);
  const yesterday = addDays(today, -1);

  // Each step runs even if an earlier one fails; errors are reported.
  const errors: string[] = [];
  const step = async <T>(name: string, fn: () => Promise<T>): Promise<T | null> => {
    try {
      return await fn();
    } catch (e) {
      console.error(`cron: ${name} failed`, e);
      errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  };

  const attendanceSummary = await step("attendance", () => closeAttendanceDay(yesterday));
  const leave = await step("leave", () => runLeaveAccruals(today, tz));
  const reminders = await step("reminders", () => sendDailyReminders(today));
  // Last, so reminders queued above for "now" are sent in this run too.
  const smsProcessed = await step("sms", () => processDueSms());

  return {
    ok: errors.length === 0,
    today,
    attendanceDate: yesterday,
    attendance: attendanceSummary,
    leave,
    reminders,
    smsProcessed,
    errors,
    tookMs: Date.now() - startedAt.getTime(),
  };
}
