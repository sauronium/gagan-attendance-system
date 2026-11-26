"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { clientSegments, clientStatuses, clientTypes, installationStatuses } from "@/db/schema";
import { type ActionState, actionError, formToObject, zf } from "@/lib/action";
import { isValidPhone, normalizePhone } from "@/lib/phone";
import { ADMIN_ROLES } from "@/lib/roles";
import { assertViewer } from "@/lib/session";
import {
  addContact,
  addInstallation,
  addSite,
  createClient,
  deleteContact,
  deleteSite,
  updateClient,
  updateContact,
  updateInstallation,
  updateSite,
} from "@/server/clients";

function refresh() {
  revalidatePath("/clients", "layout");
  revalidatePath("/amc");
  revalidatePath("/complaints");
}

const phoneField = () =>
  z
    .string({ error: "Required" })
    .trim()
    .min(1, "Required")
    .transform(normalizePhone)
    .refine(isValidPhone, "Enter a valid mobile number");

const optPhoneField = () =>
  z
    .string()
    .trim()
    .transform(normalizePhone)
    .refine(isValidPhone, "Enter a valid mobile number")
    .optional();

const clientSchema = z.object({
  name: zf.text(150),
  type: z.enum(clientTypes),
  gstNo: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[0-9A-Z]{15}$/, "GSTIN is 15 letters and digits")
    .optional(),
  segment: z.enum(clientSegments).optional(),
  source: zf.optText(50),
  salesOwnerId: zf.optId(),
  status: z.enum(clientStatuses),
  tags: zf.optText(255),
  notes: zf.optText(2000),
});

const contactSchema = z.object({
  name: zf.text(120),
  designation: zf.optText(100),
  phone: phoneField(),
  altPhone: optPhoneField(),
  email: z.email("Enter a valid email").max(191).optional(),
  isPrimary: zf.bool(),
  smsOptIn: zf.bool(),
});

const siteSchema = z.object({
  label: zf.optText(100),
  addressLine: zf.text(255),
  area: zf.optText(100),
  city: zf.optText(100),
  state: zf.optText(60),
  pincode: z.string().trim().regex(/^\d{6}$/, "6-digit PIN code").optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});

function clientData(parsed: z.infer<typeof clientSchema>) {
  const tags = parsed.tags
    ?.split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return {
    name: parsed.name,
    type: parsed.type,
    gstNo: parsed.gstNo ?? null,
    segment: parsed.segment ?? null,
    source: parsed.source ?? null,
    salesOwnerId: parsed.salesOwnerId ?? null,
    status: parsed.status,
    tags: tags?.length ? tags : null,
    notes: parsed.notes ?? null,
  };
}

function siteData(s: z.infer<typeof siteSchema>) {
  return {
    label: s.label ?? null,
    addressLine: s.addressLine,
    area: s.area ?? null,
    city: s.city ?? null,
    state: s.state ?? null,
    pincode: s.pincode ?? null,
    lat: s.lat ?? null,
    lng: s.lng ?? null,
  };
}

function contactData(c: z.infer<typeof contactSchema>) {
  return {
    name: c.name,
    designation: c.designation ?? null,
    phone: c.phone,
    altPhone: c.altPhone ?? null,
    email: c.email ?? null,
    isPrimary: c.isPrimary,
    smsOptIn: c.smsOptIn,
  };
}

/** Contact and site fields in the New client form are prefixed to keep names unique. */
function prefixed(obj: Record<string, string | undefined>, prefix: string) {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith(prefix)) out[k.slice(prefix.length)] = v;
  }
  return out;
}

function prefixIssues(e: z.ZodError | undefined, prefix: string) {
  return (e?.issues ?? []).map((i) => ({ ...i, path: [`${prefix}${String(i.path[0] ?? "")}`, ...i.path.slice(1)] }));
}

export async function createClientAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: number;
  try {
    const viewer = await assertViewer(ADMIN_ROLES);
    const raw = formToObject(fd);
    const client = clientSchema.safeParse(raw);
    const contact = contactSchema.safeParse(prefixed(raw, "contact_"));
    const site = siteSchema.safeParse(prefixed(raw, "site_"));
    if (!client.success || !contact.success || !site.success) {
      throw new z.ZodError([
        ...(client.error?.issues ?? []),
        ...prefixIssues(contact.error, "contact_"),
        ...prefixIssues(site.error, "site_"),
      ]);
    }
    id = await createClient(
      { client: clientData(client.data), contact: { ...contactData(contact.data), isPrimary: true }, site: siteData(site.data) },
      viewer.employee.id,
    );
    refresh();
  } catch (e) {
    return actionError(e);
  }
  redirect(`/clients/${id}`);
}

export async function updateClientAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(ADMIN_ROLES);
    const raw = formToObject(fd);
    const id = zf.id().parse(raw.id);
    const data = clientSchema.parse(raw);
    await updateClient(id, clientData(data), viewer.employee.id);
    refresh();
    return { ok: true, message: "Client details saved." };
  } catch (e) {
    return actionError(e);
  }
}

export async function addContactAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(ADMIN_ROLES);
    const raw = formToObject(fd);
    const clientId = zf.id().parse(raw.clientId);
    const data = contactSchema.parse(raw);
    await addContact(clientId, contactData(data), viewer.employee.id);
    refresh();
    return { ok: true, message: `Contact ${data.name} added.` };
  } catch (e) {
    return actionError(e);
  }
}

export async function addSiteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(ADMIN_ROLES);
    const raw = formToObject(fd);
    const clientId = zf.id().parse(raw.clientId);
    const data = siteSchema.parse(raw);
    await addSite(clientId, siteData(data), viewer.employee.id);
    refresh();
    return { ok: true, message: "Site added." };
  } catch (e) {
    return actionError(e);
  }
}

const installationSchema = z.object({
  siteId: zf.id(),
  plantType: zf.optText(50),
  capacityLph: z.coerce.number().int().min(1).max(10_000_000).optional(),
  model: zf.optText(100),
  serialNo: zf.optText(100),
  membraneSpec: zf.optText(150),
  installedOn: zf.optDate(),
  warrantyUntil: zf.optDate(),
  notes: zf.optText(2000),
});

function installationData(d: z.infer<typeof installationSchema>) {
  return {
    siteId: d.siteId,
    plantType: d.plantType ?? null,
    capacityLph: d.capacityLph ?? null,
    model: d.model ?? null,
    serialNo: d.serialNo ?? null,
    membraneSpec: d.membraneSpec ?? null,
    installedOn: d.installedOn ?? null,
    warrantyUntil: d.warrantyUntil ?? null,
    notes: d.notes ?? null,
  };
}

export async function addInstallationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(ADMIN_ROLES);
    const raw = formToObject(fd);
    const clientId = zf.id().parse(raw.clientId);
    const data = installationSchema.parse(raw);
    await addInstallation(clientId, installationData(data), viewer.employee.id);
    refresh();
    return { ok: true, message: "Plant added." };
  } catch (e) {
    return actionError(e);
  }
}

export async function updateInstallationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(ADMIN_ROLES);
    const raw = formToObject(fd);
    const clientId = zf.id().parse(raw.clientId);
    const id = zf.id().parse(raw.id);
    const data = installationSchema.extend({ status: z.enum(installationStatuses) }).parse(raw);
    await updateInstallation(clientId, id, { ...installationData(data), status: data.status }, viewer.employee.id);
    refresh();
    return { ok: true, message: data.status === "removed" ? "Plant marked removed." : "Plant saved." };
  } catch (e) {
    return actionError(e);
  }
}

export async function updateContactAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(ADMIN_ROLES);
    const raw = formToObject(fd);
    const clientId = zf.id().parse(raw.clientId);
    const id = zf.id().parse(raw.id);
    const data = contactSchema.parse(raw);
    await updateContact(clientId, id, contactData(data), viewer.employee.id);
    refresh();
    return { ok: true, message: `Contact ${data.name} saved.` };
  } catch (e) {
    return actionError(e);
  }
}

export async function deleteContactAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(ADMIN_ROLES);
    const { clientId, id } = z.object({ clientId: zf.id(), id: zf.id() }).parse(formToObject(fd));
    await deleteContact(clientId, id, viewer.employee.id);
    refresh();
    return { ok: true, message: "Contact removed." };
  } catch (e) {
    return actionError(e);
  }
}

export async function updateSiteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(ADMIN_ROLES);
    const raw = formToObject(fd);
    const clientId = zf.id().parse(raw.clientId);
    const id = zf.id().parse(raw.id);
    const data = siteSchema.parse(raw);
    await updateSite(clientId, id, siteData(data), viewer.employee.id);
    refresh();
    return { ok: true, message: "Site saved." };
  } catch (e) {
    return actionError(e);
  }
}

export async function deleteSiteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(ADMIN_ROLES);
    const { clientId, id } = z.object({ clientId: zf.id(), id: zf.id() }).parse(formToObject(fd));
    await deleteSite(clientId, id, viewer.employee.id);
    refresh();
    return { ok: true, message: "Site removed." };
  } catch (e) {
    return actionError(e);
  }
}
