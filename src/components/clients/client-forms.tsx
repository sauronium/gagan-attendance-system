"use client";

import { PencilIcon, PlusIcon } from "lucide-react";
import { useActionState } from "react";

import { FormError, FormField, SubmitButton, useActionToast } from "@/components/app/form-bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  addContactAction,
  addInstallationAction,
  addSiteAction,
  createClientAction,
  updateClientAction,
} from "@/app/(admin)/clients/actions";
import { type ActionState, initialActionState } from "@/lib/action";
import { clientSegment } from "@/lib/labels";

import { FormDialog } from "./form-dialog";
import { clientTypeLabel } from "./format";

type Option = { value: string; label: string };

const typeOptions = Object.entries(clientTypeLabel).map(([value, label]) => ({ value, label }));
const segmentOptions = Object.entries(clientSegment).map(([value, label]) => ({ value, label }));
const statusOptions = [
  { value: "active", label: "Active" },
  { value: "prospect", label: "Prospect" },
  { value: "inactive", label: "Inactive" },
];

export type ClientDefaults = {
  name?: string;
  type?: string;
  gstNo?: string | null;
  segment?: string | null;
  source?: string | null;
  salesOwnerId?: number | null;
  status?: string;
  tags?: string[] | null;
  notes?: string | null;
};

const err = (state: ActionState, key: string) => state.fieldErrors?.[key];

// ── Field groups ─────────────────────────────────────────────

function ClientFields({ state, owners, d = {} }: { state: ActionState; owners: Option[]; d?: ClientDefaults }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <FormField label="Client name" htmlFor="c-name" error={err(state, "name")} required className="sm:col-span-2">
        <Input id="c-name" name="name" required maxLength={150} defaultValue={d.name ?? ""} placeholder="Shree Dairy Pvt Ltd" />
      </FormField>
      <FormField label="Type" htmlFor="c-type" error={err(state, "type")} required>
        <NativeSelect id="c-type" name="type" defaultValue={d.type ?? "company"} options={typeOptions} />
      </FormField>
      <FormField label="Segment" htmlFor="c-segment" error={err(state, "segment")}>
        <NativeSelect id="c-segment" name="segment" defaultValue={d.segment ?? ""} placeholder="Not set" options={segmentOptions} />
      </FormField>
      <FormField label="GSTIN" htmlFor="c-gst" error={err(state, "gstNo")}>
        <Input id="c-gst" name="gstNo" maxLength={15} defaultValue={d.gstNo ?? ""} className="uppercase" placeholder="09ABCDE1234F1Z5" />
      </FormField>
      <FormField label="Status" htmlFor="c-status" error={err(state, "status")} required>
        <NativeSelect id="c-status" name="status" defaultValue={d.status ?? "active"} options={statusOptions} />
      </FormField>
      <FormField label="Sales owner" htmlFor="c-owner" error={err(state, "salesOwnerId")}>
        <NativeSelect
          id="c-owner"
          name="salesOwnerId"
          defaultValue={d.salesOwnerId ? String(d.salesOwnerId) : ""}
          placeholder="Unassigned"
          options={owners}
        />
      </FormField>
      <FormField label="Lead source" htmlFor="c-source" error={err(state, "source")}>
        <Input id="c-source" name="source" maxLength={50} defaultValue={d.source ?? ""} placeholder="Referral, walk-in, field visit…" />
      </FormField>
      <FormField label="Tags" htmlFor="c-tags" error={err(state, "tags")} hint="Comma separated" className="sm:col-span-2">
        <Input id="c-tags" name="tags" maxLength={255} defaultValue={d.tags?.join(", ") ?? ""} placeholder="dairy, priority" />
      </FormField>
      <FormField label="Notes" htmlFor="c-notes" error={err(state, "notes")} className="sm:col-span-2">
        <Textarea id="c-notes" name="notes" rows={2} maxLength={2000} defaultValue={d.notes ?? ""} />
      </FormField>
    </div>
  );
}

function ContactFields({ state, prefix = "", primaryToggle }: { state: ActionState; prefix?: string; primaryToggle?: boolean }) {
  const n = (k: string) => `${prefix}${k}`;
  const id = (k: string) => `ct-${prefix}${k}`;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <FormField label="Contact name" htmlFor={id("name")} error={err(state, n("name"))} required>
        <Input id={id("name")} name={n("name")} required maxLength={120} />
      </FormField>
      <FormField label="Designation" htmlFor={id("designation")} error={err(state, n("designation"))}>
        <Input id={id("designation")} name={n("designation")} maxLength={100} placeholder="Owner, plant manager, accounts…" />
      </FormField>
      <FormField label="Mobile" htmlFor={id("phone")} error={err(state, n("phone"))} required hint="10-digit mobile number">
        <Input id={id("phone")} name={n("phone")} type="tel" inputMode="tel" required maxLength={20} placeholder="98123 45678" />
      </FormField>
      <FormField label="Alternate phone" htmlFor={id("altPhone")} error={err(state, n("altPhone"))}>
        <Input id={id("altPhone")} name={n("altPhone")} type="tel" inputMode="tel" maxLength={20} />
      </FormField>
      <FormField label="Email" htmlFor={id("email")} error={err(state, n("email"))} className="sm:col-span-2">
        <Input id={id("email")} name={n("email")} type="email" maxLength={191} />
      </FormField>
      <div className="flex flex-wrap gap-x-6 gap-y-2 sm:col-span-2">
        <div className="flex h-9 items-center gap-2">
          <Checkbox id={id("sms")} name={n("smsOptIn")} defaultChecked />
          <Label htmlFor={id("sms")} className="font-normal">Send automatic SMS to this contact</Label>
        </div>
        {primaryToggle ? (
          <div className="flex h-9 items-center gap-2">
            <Checkbox id={id("primary")} name={n("isPrimary")} />
            <Label htmlFor={id("primary")} className="font-normal">Make primary contact</Label>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SiteFields({ state, prefix = "" }: { state: ActionState; prefix?: string }) {
  const n = (k: string) => `${prefix}${k}`;
  const id = (k: string) => `st-${prefix}${k}`;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <FormField label="Address" htmlFor={id("addressLine")} error={err(state, n("addressLine"))} required className="sm:col-span-2">
        <Input id={id("addressLine")} name={n("addressLine")} required maxLength={255} placeholder="Plot 14, Industrial Area Phase 2" />
      </FormField>
      <FormField label="Site label" htmlFor={id("label")} error={err(state, n("label"))}>
        <Input id={id("label")} name={n("label")} maxLength={100} placeholder="Main plant, Head office…" />
      </FormField>
      <FormField label="Area" htmlFor={id("area")} error={err(state, n("area"))}>
        <Input id={id("area")} name={n("area")} maxLength={100} />
      </FormField>
      <FormField label="City" htmlFor={id("city")} error={err(state, n("city"))}>
        <Input id={id("city")} name={n("city")} maxLength={100} />
      </FormField>
      <FormField label="State" htmlFor={id("state")} error={err(state, n("state"))}>
        <Input id={id("state")} name={n("state")} maxLength={60} />
      </FormField>
      <FormField label="PIN code" htmlFor={id("pincode")} error={err(state, n("pincode"))}>
        <Input id={id("pincode")} name={n("pincode")} inputMode="numeric" maxLength={6} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Latitude" htmlFor={id("lat")} error={err(state, n("lat"))}>
          <Input id={id("lat")} name={n("lat")} inputMode="decimal" placeholder="28.5355" />
        </FormField>
        <FormField label="Longitude" htmlFor={id("lng")} error={err(state, n("lng"))}>
          <Input id={id("lng")} name={n("lng")} inputMode="decimal" placeholder="77.3910" />
        </FormField>
      </div>
    </div>
  );
}

// ── Forms and dialogs ────────────────────────────────────────

/** Full page form for /clients/new: client, primary contact and first site. */
export function NewClientForm({ owners }: { owners: Option[] }) {
  const [state, action] = useActionState(createClientAction, initialActionState);
  useActionToast(state);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Client</CardTitle>
          <CardDescription>The company or person who pays.</CardDescription>
        </CardHeader>
        <CardContent>
          <ClientFields state={state} owners={owners} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Primary contact</CardTitle>
          <CardDescription>Automatic SMS (contract, service, complaints) go to this person if opted in.</CardDescription>
        </CardHeader>
        <CardContent>
          <ContactFields state={state} prefix="contact_" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>First site</CardTitle>
          <CardDescription>Where the plant is installed. The map pin is used to flag far-off field visits.</CardDescription>
        </CardHeader>
        <CardContent>
          <SiteFields state={state} prefix="site_" />
        </CardContent>
      </Card>
      <FormError state={state} />
      <div className="flex justify-end">
        <SubmitButton size="lg" pendingLabel="Saving…">Create client</SubmitButton>
      </div>
    </form>
  );
}

export function EditClientDialog({ clientId, owners, defaults }: { clientId: number; owners: Option[]; defaults: ClientDefaults }) {
  return (
    <FormDialog
      action={updateClientAction}
      hidden={{ id: clientId }}
      title="Edit client"
      submitLabel="Save"
      trigger={
        <Button variant="outline">
          <PencilIcon /> Edit
        </Button>
      }
    >
      {(state) => <ClientFields state={state} owners={owners} d={defaults} />}
    </FormDialog>
  );
}

export function AddContactDialog({ clientId }: { clientId: number }) {
  return (
    <FormDialog
      action={addContactAction}
      hidden={{ clientId }}
      title="Add contact"
      submitLabel="Add contact"
      trigger={
        <Button size="sm" variant="outline">
          <PlusIcon /> Contact
        </Button>
      }
    >
      {(state) => <ContactFields state={state} primaryToggle />}
    </FormDialog>
  );
}

export function AddSiteDialog({ clientId }: { clientId: number }) {
  return (
    <FormDialog
      action={addSiteAction}
      hidden={{ clientId }}
      title="Add site"
      submitLabel="Add site"
      trigger={
        <Button size="sm" variant="outline">
          <PlusIcon /> Site
        </Button>
      }
    >
      {(state) => <SiteFields state={state} />}
    </FormDialog>
  );
}

export function AddInstallationDialog({ clientId, sites }: { clientId: number; sites: Option[] }) {
  return (
    <FormDialog
      action={addInstallationAction}
      hidden={{ clientId }}
      title="Add plant"
      description="An RO plant installed at one of this client's sites."
      submitLabel="Add plant"
      trigger={
        <Button size="sm">
          <PlusIcon /> Plant
        </Button>
      }
    >
      {(state) => (
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Site" htmlFor="in-site" error={err(state, "siteId")} required className="sm:col-span-2">
            <NativeSelect id="in-site" name="siteId" required defaultValue={sites[0]?.value ?? ""} options={sites} />
          </FormField>
          <FormField label="Plant type" htmlFor="in-type" error={err(state, "plantType")}>
            <Input id="in-type" name="plantType" maxLength={50} placeholder="Industrial RO, softener…" />
          </FormField>
          <FormField label="Capacity (LPH)" htmlFor="in-cap" error={err(state, "capacityLph")}>
            <Input id="in-cap" name="capacityLph" type="number" min={1} inputMode="numeric" placeholder="500" />
          </FormField>
          <FormField label="Model" htmlFor="in-model" error={err(state, "model")}>
            <Input id="in-model" name="model" maxLength={100} />
          </FormField>
          <FormField label="Serial number" htmlFor="in-serial" error={err(state, "serialNo")}>
            <Input id="in-serial" name="serialNo" maxLength={100} />
          </FormField>
          <FormField label="Membrane spec" htmlFor="in-membrane" error={err(state, "membraneSpec")} className="sm:col-span-2">
            <Input id="in-membrane" name="membraneSpec" maxLength={150} placeholder="4040 × 2, 75 GPD" />
          </FormField>
          <FormField label="Installed on" htmlFor="in-on" error={err(state, "installedOn")}>
            <Input id="in-on" name="installedOn" type="date" />
          </FormField>
          <FormField label="Warranty until" htmlFor="in-warranty" error={err(state, "warrantyUntil")}>
            <Input id="in-warranty" name="warrantyUntil" type="date" />
          </FormField>
        </div>
      )}
    </FormDialog>
  );
}
