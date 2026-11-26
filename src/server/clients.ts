import "server-only";

import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";

import { plantLabel } from "@/components/clients/format";
import { db } from "@/db";
import {
  amcContracts,
  type ClientSegment,
  type ClientStatus,
  type ClientType,
  clientContacts,
  clients,
  clientSites,
  complaints,
  fieldVisits,
  installations,
  type InstallationStatus,
  serviceVisits,
  smsMessages,
} from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { formatDate, zonedMidnight } from "@/lib/time";

import type { Option } from "./lookups";

// Client directory rules shared by the admin Clients, AMC and Complaints
// screens: creating clients with their first contact and site, adding
// contacts / sites / plants, picking the SMS contact and the timeline.

export type ClientInput = {
  name: string;
  type: ClientType;
  gstNo?: string | null;
  segment?: ClientSegment | null;
  source?: string | null;
  salesOwnerId?: number | null;
  status: ClientStatus;
  tags?: string[] | null;
  notes?: string | null;
};

export type ContactInput = {
  name: string;
  designation?: string | null;
  phone: string;
  altPhone?: string | null;
  email?: string | null;
  isPrimary?: boolean;
  smsOptIn: boolean;
};

export type SiteInput = {
  label?: string | null;
  addressLine: string;
  area?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export type InstallationInput = {
  siteId: number;
  plantType?: string | null;
  capacityLph?: number | null;
  model?: string | null;
  serialNo?: string | null;
  membraneSpec?: string | null;
  installedOn?: string | null;
  warrantyUntil?: string | null;
  notes?: string | null;
};

/** New client with its primary contact and first site, in one transaction. */
export async function createClient(
  input: { client: ClientInput; contact: ContactInput; site: SiteInput },
  actorId: number,
): Promise<number> {
  const clientId = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(clients)
      .values({ ...input.client, createdBy: actorId })
      .$returningId();
    await tx.insert(clientContacts).values({ ...input.contact, clientId: row.id, isPrimary: true });
    await tx.insert(clientSites).values({ ...input.site, clientId: row.id });
    return row.id;
  });
  await logAudit({ actorId, tableName: "clients", recordId: clientId, action: "create", after: input });
  return clientId;
}

export async function updateClient(id: number, data: ClientInput, actorId: number) {
  const before = await db.query.clients.findFirst({ where: eq(clients.id, id) });
  if (!before) throw new Error("Client not found.");
  await db.update(clients).set(data).where(eq(clients.id, id));
  await logAudit({
    actorId,
    tableName: "clients",
    recordId: id,
    action: "update",
    before: {
      name: before.name,
      type: before.type,
      gstNo: before.gstNo,
      segment: before.segment,
      status: before.status,
      salesOwnerId: before.salesOwnerId,
    },
    after: data,
  });
}

/** Adds a contact. The first contact, or one marked primary, becomes the only primary. */
export async function addContact(clientId: number, data: ContactInput, actorId: number) {
  const id = await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: clientContacts.id })
      .from(clientContacts)
      .where(eq(clientContacts.clientId, clientId));
    const makePrimary = Boolean(data.isPrimary) || existing.length === 0;
    if (makePrimary && existing.length) {
      await tx.update(clientContacts).set({ isPrimary: false }).where(eq(clientContacts.clientId, clientId));
    }
    const [row] = await tx
      .insert(clientContacts)
      .values({ ...data, clientId, isPrimary: makePrimary, optedOutAt: data.smsOptIn ? null : new Date() })
      .$returningId();
    return row.id;
  });
  await logAudit({ actorId, tableName: "client_contacts", recordId: id, action: "create", after: { clientId, ...data } });
  return id;
}

export async function addSite(clientId: number, data: SiteInput, actorId: number) {
  const [row] = await db.insert(clientSites).values({ ...data, clientId }).$returningId();
  await logAudit({ actorId, tableName: "client_sites", recordId: row.id, action: "create", after: { clientId, ...data } });
  return row.id;
}

export async function addInstallation(clientId: number, data: InstallationInput, actorId: number) {
  const site = await db.query.clientSites.findFirst({
    where: and(eq(clientSites.id, data.siteId), eq(clientSites.clientId, clientId)),
    columns: { id: true },
  });
  if (!site) throw new Error("Pick one of this client's sites.");
  if (data.installedOn && data.warrantyUntil && data.warrantyUntil < data.installedOn) {
    throw new Error("Warranty end is before the installation date.");
  }
  const [row] = await db.insert(installations).values(data).$returningId();
  await logAudit({ actorId, tableName: "installations", recordId: row.id, action: "create", after: { ...data } });
  return row.id;
}

// ── Editing and removing contacts, sites and plants ──────────

async function contactOf(clientId: number, contactId: number) {
  const c = await db.query.clientContacts.findFirst({
    where: and(eq(clientContacts.id, contactId), eq(clientContacts.clientId, clientId)),
  });
  if (!c) throw new Error("Contact not found.");
  return c;
}

/**
 * Edit a contact. Ticking "primary" moves the primary flag here; the current
 * primary can only stop being primary by making another contact primary.
 */
export async function updateContact(clientId: number, contactId: number, data: ContactInput, actorId: number) {
  const before = await contactOf(clientId, contactId);
  const isPrimary = before.isPrimary || Boolean(data.isPrimary);
  await db.transaction(async (tx) => {
    if (isPrimary && !before.isPrimary) {
      await tx.update(clientContacts).set({ isPrimary: false }).where(eq(clientContacts.clientId, clientId));
    }
    await tx
      .update(clientContacts)
      .set({
        ...data,
        isPrimary,
        optedOutAt: data.smsOptIn ? null : (before.optedOutAt ?? new Date()),
      })
      .where(eq(clientContacts.id, contactId));
  });
  await logAudit({
    actorId,
    tableName: "client_contacts",
    recordId: contactId,
    action: "update",
    before: { name: before.name, phone: before.phone, email: before.email, isPrimary: before.isPrimary, smsOptIn: before.smsOptIn },
    after: { ...data, isPrimary },
  });
}

/** Remove a contact. Past SMS keep their text and number. A removed primary hands over to the next contact. */
export async function deleteContact(clientId: number, contactId: number, actorId: number) {
  const before = await contactOf(clientId, contactId);
  await db.transaction(async (tx) => {
    await tx.update(smsMessages).set({ contactId: null }).where(eq(smsMessages.contactId, contactId));
    await tx.delete(clientContacts).where(eq(clientContacts.id, contactId));
    if (before.isPrimary) {
      const [next] = await tx
        .select({ id: clientContacts.id })
        .from(clientContacts)
        .where(eq(clientContacts.clientId, clientId))
        .orderBy(asc(clientContacts.id))
        .limit(1);
      if (next) await tx.update(clientContacts).set({ isPrimary: true }).where(eq(clientContacts.id, next.id));
    }
  });
  await logAudit({
    actorId,
    tableName: "client_contacts",
    recordId: contactId,
    action: "delete",
    before: { clientId, name: before.name, phone: before.phone, isPrimary: before.isPrimary },
  });
}

async function siteOf(clientId: number, siteId: number) {
  const site = await db.query.clientSites.findFirst({
    where: and(eq(clientSites.id, siteId), eq(clientSites.clientId, clientId)),
  });
  if (!site) throw new Error("Site not found.");
  return site;
}

export async function updateSite(clientId: number, siteId: number, data: SiteInput, actorId: number) {
  const before = await siteOf(clientId, siteId);
  await db.update(clientSites).set(data).where(eq(clientSites.id, siteId));
  await logAudit({
    actorId,
    tableName: "client_sites",
    recordId: siteId,
    action: "update",
    before: { addressLine: before.addressLine, area: before.area, city: before.city, lat: before.lat, lng: before.lng },
    after: data,
  });
}

/** Remove a site that has no plants. Field visits logged there keep their GPS and notes. */
export async function deleteSite(clientId: number, siteId: number, actorId: number) {
  const before = await siteOf(clientId, siteId);
  const plant = await db.query.installations.findFirst({ where: eq(installations.siteId, siteId), columns: { id: true } });
  if (plant) throw new Error("This site has plants. Move or remove them first (removed plants keep their history here).");
  await db.transaction(async (tx) => {
    await tx.update(fieldVisits).set({ siteId: null }).where(eq(fieldVisits.siteId, siteId));
    await tx.delete(clientSites).where(eq(clientSites.id, siteId));
  });
  await logAudit({
    actorId,
    tableName: "client_sites",
    recordId: siteId,
    action: "delete",
    before: { clientId, addressLine: before.addressLine, area: before.area, city: before.city },
  });
}

/**
 * Edit a plant, including moving it to another of the client's sites or
 * marking it removed. Plants are never deleted: contracts, visits and
 * complaints refer to them.
 */
export async function updateInstallation(
  clientId: number,
  installationId: number,
  data: InstallationInput & { status: InstallationStatus },
  actorId: number,
) {
  const before = await db.query.installations.findFirst({
    where: eq(installations.id, installationId),
    with: { site: { columns: { clientId: true } } },
  });
  if (!before || before.site.clientId !== clientId) throw new Error("Plant not found.");
  await siteOf(clientId, data.siteId);
  if (data.installedOn && data.warrantyUntil && data.warrantyUntil < data.installedOn) {
    throw new Error("Warranty end is before the installation date.");
  }
  if (data.status === "removed" && before.status !== "removed") {
    const live = await db.query.amcContracts.findFirst({
      where: and(eq(amcContracts.installationId, installationId), eq(amcContracts.status, "active")),
      columns: { contractNo: true },
    });
    if (live) throw new Error(`Cancel AMC ${live.contractNo} before marking this plant removed.`);
  }
  await db.update(installations).set(data).where(eq(installations.id, installationId));
  await logAudit({
    actorId,
    tableName: "installations",
    recordId: installationId,
    action: "update",
    before: {
      siteId: before.siteId,
      model: before.model,
      serialNo: before.serialNo,
      capacityLph: before.capacityLph,
      status: before.status,
    },
    after: data,
  });
}

export type ClientContactInfo = {
  client: { id: number; name: string };
  /** Primary contact (or first contact) regardless of opt-in, for display and technician jobs. */
  primary: { id: number; name: string; phone: string } | null;
  /** Who automatic SMS goes to: primary if opted in, else any opted-in contact. */
  sms: { id: number; name: string; phone: string } | null;
};

export async function getClientContactInfo(clientId: number): Promise<ClientContactInfo | null> {
  const client = await db.query.clients.findFirst({
    where: eq(clients.id, clientId),
    columns: { id: true, name: true },
  });
  if (!client) return null;
  const contacts = await db
    .select({
      id: clientContacts.id,
      name: clientContacts.name,
      phone: clientContacts.phone,
      smsOptIn: clientContacts.smsOptIn,
    })
    .from(clientContacts)
    .where(eq(clientContacts.clientId, clientId))
    .orderBy(desc(clientContacts.isPrimary), asc(clientContacts.id));
  const pick = (c: (typeof contacts)[number] | undefined) => (c ? { id: c.id, name: c.name, phone: c.phone } : null);
  return { client, primary: pick(contacts[0]), sms: pick(contacts.find((c) => c.smsOptIn)) };
}

/**
 * Active installations as select options: "Client · 500 LPH RO-500X (Area)".
 * Pass a client id to limit to one client (label then omits the client name).
 */
export async function installationOptions(clientId?: number): Promise<Option[]> {
  const rows = await db
    .select({
      id: installations.id,
      capacityLph: installations.capacityLph,
      model: installations.model,
      plantType: installations.plantType,
      serialNo: installations.serialNo,
      area: clientSites.area,
      city: clientSites.city,
      label: clientSites.label,
      clientName: clients.name,
    })
    .from(installations)
    .innerJoin(clientSites, eq(clientSites.id, installations.siteId))
    .innerJoin(clients, eq(clients.id, clientSites.clientId))
    .where(
      and(
        eq(installations.status, "active"),
        clientId ? eq(clients.id, clientId) : ne(clients.status, "inactive"),
      ),
    )
    .orderBy(asc(clients.name), asc(installations.id));
  return rows.map((r) => {
    const plant = [r.capacityLph ? `${r.capacityLph} LPH` : null, r.model || r.plantType].filter(Boolean).join(" ") || "Plant";
    const where = r.area || r.city || r.label;
    const serial = clientId && r.serialNo ? ` · ${r.serialNo}` : "";
    return {
      value: String(r.id),
      label: `${clientId ? "" : `${r.clientName} · `}${plant}${serial}${where ? ` (${where})` : ""}`,
    };
  });
}

/** Distinct site cities for the clients filter. */
export async function cityOptions(): Promise<Option[]> {
  const rows = await db
    .selectDistinct({ city: clientSites.city })
    .from(clientSites)
    .orderBy(asc(clientSites.city));
  return rows.filter((r) => r.city).map((r) => ({ value: r.city!, label: r.city! }));
}

export type TimelineKind = "field_visit" | "service" | "complaint" | "sms" | "contract";

export type TimelineItem = {
  key: string;
  kind: TimelineKind;
  at: Date;
  /** True when `at` is a calendar day rather than a precise time. */
  dayOnly?: boolean;
  title: string;
  detail?: string | null;
  status?: { map: "fieldVisit" | "service" | "complaint" | "sms" | "contract"; value: string };
};

/** Everything that happened with a client, newest first. */
export async function getClientTimeline(clientId: number, limit = 150): Promise<TimelineItem[]> {
  const tz = env.timezone;
  const siteRows = await db
    .select({ id: installations.id, capacityLph: installations.capacityLph, model: installations.model, plantType: installations.plantType })
    .from(installations)
    .innerJoin(clientSites, eq(clientSites.id, installations.siteId))
    .where(eq(clientSites.clientId, clientId));
  const plantIds = siteRows.map((r) => r.id);
  const plantById = new Map(siteRows.map((r) => [r.id, plantLabel(r)]));

  const [visits, services, tickets, messages, contracts] = await Promise.all([
    db.query.fieldVisits.findMany({
      where: eq(fieldVisits.clientId, clientId),
      orderBy: desc(fieldVisits.loggedAt),
      limit: 100,
      with: { employee: { columns: { name: true } } },
    }),
    plantIds.length
      ? db.query.serviceVisits.findMany({
          where: inArray(serviceVisits.installationId, plantIds),
          orderBy: desc(serviceVisits.dueOn),
          limit: 100,
          with: { technician: { columns: { name: true } } },
        })
      : Promise.resolve([]),
    db.query.complaints.findMany({
      where: eq(complaints.clientId, clientId),
      orderBy: desc(complaints.createdAt),
      limit: 100,
    }),
    db.query.smsMessages.findMany({
      where: eq(smsMessages.clientId, clientId),
      orderBy: desc(smsMessages.createdAt),
      limit: 100,
    }),
    plantIds.length
      ? db.query.amcContracts.findMany({
          where: inArray(amcContracts.installationId, plantIds),
          orderBy: desc(amcContracts.createdAt),
          limit: 50,
        })
      : Promise.resolve([]),
  ]);

  const items: TimelineItem[] = [];
  for (const v of visits) {
    items.push({
      key: `fv-${v.id}`,
      kind: "field_visit",
      at: v.loggedAt,
      title: `Field visit by ${v.employee.name}`,
      detail: [v.purpose.replace(/_/g, " "), v.notes].filter(Boolean).join(" — "),
      status: { map: "fieldVisit", value: v.status },
    });
  }
  for (const s of services) {
    const done = s.status === "done" && s.doneAt;
    items.push({
      key: `sv-${s.id}`,
      kind: "service",
      at: done ? s.doneAt! : zonedMidnight(s.dueOn, tz),
      dayOnly: !done,
      title: `${s.type === "complaint" ? "Complaint visit" : "Service visit"} · ${plantById.get(s.installationId) ?? "Plant"}`,
      detail: [s.technician ? `Technician: ${s.technician.name}` : "No technician yet", s.notes].filter(Boolean).join(" — "),
      status: { map: "service", value: s.status },
    });
  }
  for (const c of tickets) {
    items.push({
      key: `cm-${c.id}`,
      kind: "complaint",
      at: c.createdAt,
      title: `Complaint ${c.ticketNo}`,
      detail: c.resolutionNotes ? `${c.issue} — Resolved: ${c.resolutionNotes}` : c.issue,
      status: { map: "complaint", value: c.status },
    });
  }
  for (const m of messages) {
    items.push({
      key: `sms-${m.id}`,
      kind: "sms",
      at: m.createdAt,
      title: "SMS sent",
      detail: m.body,
      status: { map: "sms", value: m.status },
    });
  }
  for (const k of contracts) {
    items.push({
      key: `amc-${k.id}`,
      kind: "contract",
      at: k.createdAt,
      title: `AMC ${k.contractNo} · ${plantById.get(k.installationId) ?? "Plant"}`,
      detail: `${formatDate(k.startOn)} to ${formatDate(k.endOn)}, ${k.visitsPerYear} visits/year`,
      status: { map: "contract", value: k.status },
    });
  }
  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

