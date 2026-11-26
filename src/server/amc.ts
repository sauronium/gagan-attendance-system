import "server-only";

import { and, asc, desc, eq, gt, inArray, like, type SQL } from "drizzle-orm";

import { formatInr, siteAddress } from "@/components/clients/format";
import { db } from "@/db";
import {
  type AmcPlan,
  amcContracts,
  type ComplaintPriority,
  complaints,
  employees,
  installations,
  type PaymentStatus,
  serviceVisits,
} from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { formatPhone } from "@/lib/phone";
import { addDays, daysBetween, formatDate, todayIso } from "@/lib/time";
import { TEMPLATE_KEYS, type TemplateKey, sendTemplated } from "@/server/sms-templates";

import { getClientContactInfo } from "./clients";

// AMC contracts, service visits and complaints: the rules behind the admin
// Clients, AMC and Complaints screens (and reusable by the technician app).

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// ── Helpers ──────────────────────────────────────────────────

function paymentStatusFor(value: string | number, paid: string | number): PaymentStatus {
  const v = Number(value) || 0;
  const p = Number(paid) || 0;
  if (v <= 0 || p >= v) return "paid";
  return p > 0 ? "partial" : "unpaid";
}

/** Same calendar day one year later, minus one day (Feb 29 → Feb 28). */
function addYearMinusDay(start: string): string {
  const [y, m, d] = start.split("-").map(Number);
  const end = new Date(Date.UTC(y + 1, m - 1, d));
  end.setUTCDate(end.getUTCDate() - 1);
  return end.toISOString().slice(0, 10);
}

async function nextContractNo(runner: typeof db | Tx = db): Promise<string> {
  const prefix = `AMC-${todayIso(env.timezone).slice(0, 4)}-`;
  const [last] = await runner
    .select({ no: amcContracts.contractNo })
    .from(amcContracts)
    .where(like(amcContracts.contractNo, `${prefix}%`))
    .orderBy(desc(amcContracts.contractNo))
    .limit(1);
  const seq = last ? Number(last.no.slice(prefix.length)) || 0 : 0;
  return `${prefix}${String(seq + 1).padStart(4, "0")}`;
}

async function nextTicketNo(): Promise<string> {
  const prefix = `CMP-${todayIso(env.timezone).slice(2).replace(/-/g, "")}-`;
  const [last] = await db
    .select({ no: complaints.ticketNo })
    .from(complaints)
    .where(like(complaints.ticketNo, `${prefix}%`))
    .orderBy(desc(complaints.ticketNo))
    .limit(1);
  const seq = last ? Number(last.no.slice(prefix.length)) || 0 : 0;
  return `${prefix}${String(seq + 1).padStart(3, "0")}`;
}

/**
 * Templated SMS to a client's opted-in contact (primary first). Skips
 * silently when nobody has opted in. Never throws: a failed text must not
 * undo the business change that triggered it.
 */
async function smsClient(
  key: TemplateKey,
  clientId: number,
  vars: Record<string, string | number>,
  ref: { refType: string; refId: number; dedupeKey: string },
) {
  try {
    const info = await getClientContactInfo(clientId);
    if (!info?.sms) return null;
    return await sendTemplated(
      key,
      { client: info.client.name, contact: info.sms.name, ...vars },
      { phone: info.sms.phone, clientId, contactId: info.sms.id, ...ref },
    );
  } catch (e) {
    console.error(`SMS ${key} to client ${clientId} failed`, e);
    return null;
  }
}

async function smsEmployee(
  key: TemplateKey,
  employee: { id: number; mobile: string },
  vars: Record<string, string | number>,
  ref: { clientId?: number; refType: string; refId: number; dedupeKey: string },
) {
  try {
    return await sendTemplated(key, vars, { phone: employee.mobile, employeeId: employee.id, ...ref });
  } catch (e) {
    console.error(`SMS ${key} to employee ${employee.id} failed`, e);
    return null;
  }
}

/** Visit with the plant, site and client loaded. */
async function loadVisit(visitId: number) {
  const visit = await db.query.serviceVisits.findFirst({
    where: eq(serviceVisits.id, visitId),
    with: {
      installation: { with: { site: { with: { client: { columns: { id: true, name: true } } } } } },
      technician: { columns: { id: true, name: true, mobile: true } },
      complaint: { columns: { id: true, ticketNo: true } },
    },
  });
  if (!visit) throw new Error("Service visit not found.");
  return visit;
}

// ── Lists (shared by the AMC, Complaints and client screens) ──

const plantColumns = { id: true, capacityLph: true, model: true, plantType: true, serialNo: true } as const;
const siteWith = {
  columns: { id: true, area: true, city: true, label: true, addressLine: true },
  with: { client: { columns: { id: true, name: true } } },
} as const;

export async function listContracts(where?: SQL, limit = 300) {
  return db.query.amcContracts.findMany({
    where,
    orderBy: [asc(amcContracts.endOn), asc(amcContracts.id)],
    limit,
    with: { installation: { columns: plantColumns, with: { site: siteWith } } },
  });
}
export type ContractRow = Awaited<ReturnType<typeof listContracts>>[number];

export async function listServiceVisits(where?: SQL, limit = 300) {
  return db.query.serviceVisits.findMany({
    where,
    orderBy: [asc(serviceVisits.dueOn), asc(serviceVisits.id)],
    limit,
    with: {
      installation: { columns: plantColumns, with: { site: siteWith } },
      technician: { columns: { id: true, name: true } },
      contract: { columns: { id: true, contractNo: true } },
      complaint: { columns: { id: true, ticketNo: true } },
    },
  });
}
export type ServiceVisitRow = Awaited<ReturnType<typeof listServiceVisits>>[number];

export async function listComplaints(where?: SQL, limit = 300) {
  return db.query.complaints.findMany({
    where,
    orderBy: [desc(complaints.createdAt)],
    limit,
    with: {
      installation: { columns: plantColumns, with: { site: { columns: { area: true, city: true, label: true } } } },
      client: { columns: { id: true, name: true } },
      assignee: { columns: { id: true, name: true } },
    },
  });
}
export type ComplaintRow = Awaited<ReturnType<typeof listComplaints>>[number];

// ── Contracts ────────────────────────────────────────────────

export type ContractInput = {
  contractNo?: string | null;
  installationId: number;
  plan: AmcPlan;
  startOn: string;
  endOn: string;
  visitsPerYear: number;
  filterChangeEveryDays?: number | null;
  membraneChangeEveryDays?: number | null;
  value: string;
  amountPaid: string;
  notes?: string | null;
};

/**
 * Inserts the contract's AMC visits: `visitsPerYear` per year of contract,
 * evenly spaced, the first one interval after the start, none after the end.
 */
async function generateServiceVisits(
  contract: { id: number; installationId: number; startOn: string; endOn: string; visitsPerYear: number },
  runner: typeof db | Tx = db,
): Promise<string[]> {
  const totalDays = daysBetween(contract.startOn, contract.endOn) + 1;
  if (contract.visitsPerYear <= 0 || totalDays <= 0) return [];
  const count = Math.max(1, Math.round((contract.visitsPerYear * totalDays) / 365));
  const interval = totalDays / count;
  const dates: string[] = [];
  for (let i = 1; i <= count; i++) {
    const due = addDays(contract.startOn, Math.round(i * interval));
    dates.push(due > contract.endOn ? contract.endOn : due);
  }
  await runner.insert(serviceVisits).values(
    dates.map((dueOn) => ({
      installationId: contract.installationId,
      contractId: contract.id,
      type: "amc" as const,
      dueOn,
      status: "scheduled" as const,
    })),
  );
  return dates;
}

async function contractCreatedSms(contractId: number) {
  const k = await db.query.amcContracts.findFirst({
    where: eq(amcContracts.id, contractId),
    with: { installation: { with: { site: true } } },
  });
  if (!k) return;
  const [first] = await db
    .select({ dueOn: serviceVisits.dueOn })
    .from(serviceVisits)
    .where(and(eq(serviceVisits.contractId, contractId), eq(serviceVisits.status, "scheduled")))
    .orderBy(asc(serviceVisits.dueOn))
    .limit(1);
  await smsClient(
    TEMPLATE_KEYS.contractCreated,
    k.installation.site.clientId,
    {
      contractNo: k.contractNo,
      date: formatDate(k.startOn),
      endDate: formatDate(k.endOn),
      amount: formatInr(k.value),
      nextDate: first ? formatDate(first.dueOn) : "—",
      address: siteAddress(k.installation.site),
    },
    { refType: "amc_contract", refId: k.id, dedupeKey: `contract_created:${k.id}` },
  );
}

export async function createContract(input: ContractInput, actorId: number): Promise<number> {
  if (input.endOn < input.startOn) throw new Error("End date is before the start date.");
  const inst = await db.query.installations.findFirst({
    where: eq(installations.id, input.installationId),
    columns: { id: true, status: true },
  });
  if (!inst) throw new Error("Plant not found.");
  if (inst.status !== "active") throw new Error("This plant has been removed.");

  const id = await db.transaction(async (tx) => {
    const contractNo = input.contractNo?.trim() || (await nextContractNo(tx));
    const values = {
      ...input,
      contractNo,
      paymentStatus: paymentStatusFor(input.value, input.amountPaid),
      status: "active" as const,
      createdBy: actorId,
    };
    const [row] = await tx.insert(amcContracts).values(values).$returningId();
    await generateServiceVisits({ id: row.id, ...input }, tx);
    return row.id;
  });
  await logAudit({ actorId, tableName: "amc_contracts", recordId: id, action: "create", after: { ...input } });
  await contractCreatedSms(id);
  return id;
}

/** One-click renew: same length and terms from the day after the old end. */
export async function renewContract(id: number, actorId: number): Promise<number> {
  const old = await db.query.amcContracts.findFirst({ where: eq(amcContracts.id, id) });
  if (!old) throw new Error("Contract not found.");
  if (old.status === "renewed") throw new Error("This contract has already been renewed.");
  if (old.status === "cancelled") throw new Error("A cancelled contract can't be renewed.");

  const startOn = addDays(old.endOn, 1);
  const yearly = addYearMinusDay(old.startOn) === old.endOn;
  const endOn = yearly ? addYearMinusDay(startOn) : addDays(startOn, daysBetween(old.startOn, old.endOn));

  const newId = await db.transaction(async (tx) => {
    const contractNo = await nextContractNo(tx);
    const values = {
      contractNo,
      installationId: old.installationId,
      plan: old.plan,
      startOn,
      endOn,
      visitsPerYear: old.visitsPerYear,
      filterChangeEveryDays: old.filterChangeEveryDays,
      membraneChangeEveryDays: old.membraneChangeEveryDays,
      value: old.value,
      amountPaid: "0.00",
      paymentStatus: paymentStatusFor(old.value, 0),
      status: "active" as const,
      renewedFromId: old.id,
      createdBy: actorId,
    };
    const [row] = await tx.insert(amcContracts).values(values).$returningId();
    await tx.update(amcContracts).set({ status: "renewed" }).where(eq(amcContracts.id, old.id));
    await generateServiceVisits({ id: row.id, installationId: old.installationId, startOn, endOn, visitsPerYear: old.visitsPerYear }, tx);
    return row.id;
  });
  await logAudit({ actorId, tableName: "amc_contracts", recordId: old.id, action: "update", before: { status: old.status }, after: { status: "renewed", renewedById: newId } });
  await logAudit({ actorId, tableName: "amc_contracts", recordId: newId, action: "create", after: { renewedFromId: old.id, startOn, endOn } });
  await contractCreatedSms(newId);
  return newId;
}

/** Record money received against a contract; updates the payment status. */
export async function recordContractPayment(
  id: number,
  input: { amount: number; remark?: string | null },
  actorId: number,
) {
  const k = await db.query.amcContracts.findFirst({ where: eq(amcContracts.id, id) });
  if (!k) throw new Error("Contract not found.");
  if (!(input.amount > 0)) throw new Error("Enter the amount received.");
  const due = Math.max(0, Number(k.value) - Number(k.amountPaid));
  if (due <= 0) throw new Error("This contract is already fully paid.");
  if (input.amount > due + 0.001) throw new Error(`Only ${formatInr(due)} is due on this contract.`);

  const amountPaid = (Number(k.amountPaid) + input.amount).toFixed(2);
  const paymentStatus = paymentStatusFor(k.value, amountPaid);
  await db.update(amcContracts).set({ amountPaid, paymentStatus }).where(eq(amcContracts.id, id));
  await logAudit({
    actorId,
    tableName: "amc_contracts",
    recordId: id,
    action: "update",
    before: { amountPaid: k.amountPaid, paymentStatus: k.paymentStatus },
    after: { amountPaid, paymentStatus, received: input.amount.toFixed(2) },
    reason: input.remark ?? "Payment received",
  });
  return { amountPaid, paymentStatus, due: Math.max(0, Number(k.value) - Number(amountPaid)) };
}

/** Cancel a contract: future scheduled visits are cancelled too. No SMS. */
export async function cancelContract(id: number, reason: string, actorId: number) {
  const k = await db.query.amcContracts.findFirst({ where: eq(amcContracts.id, id) });
  if (!k) throw new Error("Contract not found.");
  if (k.status === "cancelled") throw new Error("This contract is already cancelled.");
  if (k.status === "renewed") throw new Error("This contract was renewed. Cancel the new contract instead.");

  const cancelledVisits = await db.transaction(async (tx) => {
    await tx.update(amcContracts).set({ status: "cancelled" }).where(eq(amcContracts.id, id));
    const [res] = await tx
      .update(serviceVisits)
      .set({ status: "cancelled", notes: `Contract cancelled: ${reason}`.slice(0, 2000) })
      .where(and(eq(serviceVisits.contractId, id), eq(serviceVisits.status, "scheduled")));
    return res.affectedRows;
  });
  await logAudit({
    actorId,
    tableName: "amc_contracts",
    recordId: id,
    action: "update",
    before: { status: k.status },
    after: { status: "cancelled", cancelledVisits },
    reason,
  });
  return { cancelledVisits };
}

// ── Service visits ───────────────────────────────────────────

/** SMS the client (technician_assigned) and the technician (technician_job). */
async function notifyAssignment(visitId: number) {
  const v = await loadVisit(visitId);
  if (!v.technician) return;
  const site = v.installation.site;
  const clientId = site.client.id;
  const info = await getClientContactInfo(clientId);
  const tech = v.technician;
  const common = {
    client: site.client.name,
    date: formatDate(v.dueOn),
    technician: tech.name,
    technicianPhone: formatPhone(tech.mobile),
    address: siteAddress(site),
    ticket: v.complaint?.ticketNo ?? "",
  };
  await smsClient(TEMPLATE_KEYS.technicianAssigned, clientId, common, {
    refType: "service_visit",
    refId: v.id,
    dedupeKey: `technician_assigned:visit:${v.id}:${tech.id}`,
  });
  await smsEmployee(
    TEMPLATE_KEYS.technicianJob,
    tech,
    {
      ...common,
      contact: info?.primary?.name ?? "",
      contactPhone: formatPhone(info?.primary?.phone),
    },
    { clientId, refType: "service_visit", refId: v.id, dedupeKey: `technician_job:visit:${v.id}:${tech.id}` },
  );
}

export async function assignTechnician(visitId: number, techId: number, actorId: number) {
  const visit = await db.query.serviceVisits.findFirst({ where: eq(serviceVisits.id, visitId) });
  if (!visit) throw new Error("Service visit not found.");
  if (visit.status !== "scheduled") throw new Error(`This visit is already ${visit.status}.`);
  const tech = await db.query.employees.findFirst({
    where: eq(employees.id, techId),
    columns: { id: true, name: true, status: true },
  });
  if (!tech || tech.status === "inactive") throw new Error("Pick an active technician.");
  if (visit.technicianId === techId) return { changed: false, name: tech.name };

  await db.update(serviceVisits).set({ technicianId: techId }).where(eq(serviceVisits.id, visitId));
  if (visit.complaintId) {
    const c = await db.query.complaints.findFirst({ where: eq(complaints.id, visit.complaintId) });
    if (c && (c.status === "open" || c.status === "assigned" || c.status === "in_progress")) {
      await db
        .update(complaints)
        .set({ assignedTo: techId, status: c.status === "open" ? "assigned" : c.status })
        .where(eq(complaints.id, c.id));
    }
  }
  await logAudit({
    actorId,
    tableName: "service_visits",
    recordId: visitId,
    action: "update",
    before: { technicianId: visit.technicianId },
    after: { technicianId: techId },
  });
  await notifyAssignment(visitId);
  return { changed: true, name: tech.name };
}

export type VisitOutcome = "done" | "missed" | "rescheduled";

export async function markServiceVisit(
  visitId: number,
  outcome: VisitOutcome,
  opts: { notes?: string | null; nextDueOn?: string | null; newDate?: string | null },
  actorId: number,
): Promise<{ newVisitId?: number; nextDueOn?: string | null }> {
  const v = await loadVisit(visitId);
  if (v.status !== "scheduled") throw new Error(`This visit is already ${v.status}.`);
  const notes = opts.notes?.trim() || null;

  if (outcome === "missed") {
    await db.update(serviceVisits).set({ status: "missed", notes: notes ?? v.notes }).where(eq(serviceVisits.id, visitId));
    await logAudit({ actorId, tableName: "service_visits", recordId: visitId, action: "update", after: { status: "missed" }, reason: notes });
    return {};
  }

  if (outcome === "rescheduled") {
    if (!opts.newDate) throw new Error("Pick the new date.");
    if (opts.newDate === v.dueOn) throw new Error("The new date is the same as the current due date.");
    const newVisitId = await db.transaction(async (tx) => {
      await tx.update(serviceVisits).set({ status: "rescheduled", notes: notes ?? v.notes }).where(eq(serviceVisits.id, visitId));
      const [row] = await tx
        .insert(serviceVisits)
        .values({
          installationId: v.installationId,
          contractId: v.contractId,
          complaintId: v.complaintId,
          type: v.type,
          technicianId: v.technicianId,
          dueOn: opts.newDate!,
          status: "scheduled",
        })
        .$returningId();
      return row.id;
    });
    await logAudit({
      actorId,
      tableName: "service_visits",
      recordId: visitId,
      action: "update",
      after: { status: "rescheduled", newVisitId, newDate: opts.newDate },
      reason: notes,
    });
    return { newVisitId };
  }

  // Done: default next due date = the contract's next scheduled visit.
  let nextDueOn = opts.nextDueOn ?? null;
  if (!nextDueOn && v.contractId) {
    const [next] = await db
      .select({ dueOn: serviceVisits.dueOn })
      .from(serviceVisits)
      .where(
        and(
          eq(serviceVisits.contractId, v.contractId),
          eq(serviceVisits.status, "scheduled"),
          gt(serviceVisits.dueOn, v.dueOn),
        ),
      )
      .orderBy(asc(serviceVisits.dueOn))
      .limit(1);
    nextDueOn = next?.dueOn ?? null;
  }
  await db
    .update(serviceVisits)
    .set({ status: "done", doneAt: new Date(), notes: notes ?? v.notes, nextDueOn })
    .where(eq(serviceVisits.id, visitId));
  await logAudit({ actorId, tableName: "service_visits", recordId: visitId, action: "update", after: { status: "done", nextDueOn }, reason: notes });
  await smsClient(
    TEMPLATE_KEYS.serviceCompleted,
    v.installation.site.client.id,
    {
      date: formatDate(todayIso(env.timezone)),
      technician: v.technician?.name ?? "our technician",
      technicianPhone: formatPhone(v.technician?.mobile),
      nextDate: nextDueOn ? formatDate(nextDueOn) : "to be confirmed",
      address: siteAddress(v.installation.site),
    },
    { refType: "service_visit", refId: v.id, dedupeKey: `service_completed:visit:${v.id}` },
  );
  return { nextDueOn };
}

// ── Complaints ───────────────────────────────────────────────

/** Default target resolution time by priority, in hours. */
const DUE_HOURS: Record<ComplaintPriority, number> = { urgent: 4, high: 24, normal: 48, low: 72 };

export async function createComplaint(
  input: { installationId: number; priority: ComplaintPriority; issue: string; dueBy?: Date | null },
  actorId: number,
): Promise<{ id: number; ticketNo: string; clientId: number }> {
  const inst = await db.query.installations.findFirst({
    where: eq(installations.id, input.installationId),
    with: { site: { columns: { clientId: true } } },
  });
  if (!inst) throw new Error("Plant not found.");
  const clientId = inst.site.clientId;
  const ticketNo = await nextTicketNo();
  const dueBy = input.dueBy ?? new Date(Date.now() + DUE_HOURS[input.priority] * 3_600_000);
  const [row] = await db
    .insert(complaints)
    .values({
      ticketNo,
      installationId: input.installationId,
      clientId,
      issue: input.issue,
      priority: input.priority,
      status: "open",
      dueBy,
      createdBy: actorId,
    })
    .$returningId();
  await logAudit({ actorId, tableName: "complaints", recordId: row.id, action: "create", after: { ticketNo, ...input, clientId } });
  await smsClient(
    TEMPLATE_KEYS.complaintReceived,
    clientId,
    { ticket: ticketNo, date: formatDate(todayIso(env.timezone)) },
    { refType: "complaint", refId: row.id, dedupeKey: `complaint_received:${row.id}` },
  );
  return { id: row.id, ticketNo, clientId };
}

async function loadComplaint(id: number) {
  const c = await db.query.complaints.findFirst({ where: eq(complaints.id, id) });
  if (!c) throw new Error("Complaint not found.");
  return c;
}

/** Assign: creates (or reuses) a complaint service visit due today and notifies everyone. */
export async function assignComplaint(id: number, techId: number, actorId: number) {
  const c = await loadComplaint(id);
  if (c.status === "resolved" || c.status === "closed") throw new Error(`This complaint is already ${c.status}.`);
  const tech = await db.query.employees.findFirst({
    where: eq(employees.id, techId),
    columns: { id: true, name: true, status: true },
  });
  if (!tech || tech.status === "inactive") throw new Error("Pick an active technician.");

  const today = todayIso(env.timezone);
  const existing = await db.query.serviceVisits.findFirst({
    where: and(eq(serviceVisits.complaintId, id), eq(serviceVisits.status, "scheduled")),
    orderBy: desc(serviceVisits.id),
  });
  let visitId: number;
  if (existing) {
    visitId = existing.id;
    await db.update(serviceVisits).set({ technicianId: techId }).where(eq(serviceVisits.id, visitId));
  } else {
    const [row] = await db
      .insert(serviceVisits)
      .values({
        installationId: c.installationId,
        complaintId: id,
        type: "complaint",
        technicianId: techId,
        dueOn: today,
        status: "scheduled",
      })
      .$returningId();
    visitId = row.id;
  }
  await db
    .update(complaints)
    .set({ assignedTo: techId, status: c.status === "in_progress" ? "in_progress" : "assigned" })
    .where(eq(complaints.id, id));
  await logAudit({
    actorId,
    tableName: "complaints",
    recordId: id,
    action: "update",
    before: { status: c.status, assignedTo: c.assignedTo },
    after: { status: "assigned", assignedTo: techId, serviceVisitId: visitId },
  });
  await notifyAssignment(visitId);
  return { ticketNo: c.ticketNo, technician: tech.name };
}

export async function startComplaint(id: number, actorId: number) {
  const c = await loadComplaint(id);
  if (c.status !== "open" && c.status !== "assigned") throw new Error(`This complaint is already ${c.status.replace("_", " ")}.`);
  await db.update(complaints).set({ status: "in_progress" }).where(eq(complaints.id, id));
  await logAudit({ actorId, tableName: "complaints", recordId: id, action: "update", before: { status: c.status }, after: { status: "in_progress" } });
  return c.ticketNo;
}

export async function resolveComplaint(id: number, notes: string, actorId: number) {
  const c = await loadComplaint(id);
  if (c.status === "resolved" || c.status === "closed") throw new Error(`This complaint is already ${c.status}.`);
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(complaints)
      .set({ status: "resolved", resolvedAt: now, resolutionNotes: notes })
      .where(eq(complaints.id, id));
    // The open complaint visit is the one that fixed it.
    await tx
      .update(serviceVisits)
      .set({ status: "done", doneAt: now, notes })
      .where(and(eq(serviceVisits.complaintId, id), eq(serviceVisits.status, "scheduled")));
  });
  await logAudit({ actorId, tableName: "complaints", recordId: id, action: "update", before: { status: c.status }, after: { status: "resolved" }, reason: notes });
  await smsClient(
    TEMPLATE_KEYS.complaintResolved,
    c.clientId,
    { ticket: c.ticketNo, date: formatDate(todayIso(env.timezone)) },
    { refType: "complaint", refId: id, dedupeKey: `complaint_resolved:${id}` },
  );
  return c.ticketNo;
}

export async function closeComplaint(id: number, actorId: number, remark?: string | null) {
  const c = await loadComplaint(id);
  if (c.status === "closed") throw new Error("This complaint is already closed.");
  await db.transaction(async (tx) => {
    await tx.update(complaints).set({ status: "closed", closedAt: new Date() }).where(eq(complaints.id, id));
    // Closed without a fix (duplicate, withdrawn): drop the pending visit.
    await tx
      .update(serviceVisits)
      .set({ status: "cancelled" })
      .where(and(eq(serviceVisits.complaintId, id), inArray(serviceVisits.status, ["scheduled"])));
  });
  await logAudit({ actorId, tableName: "complaints", recordId: id, action: "update", before: { status: c.status }, after: { status: "closed" }, reason: remark ?? null });
  return c.ticketNo;
}
