"use client";

import { PlusIcon } from "lucide-react";
import { useState } from "react";

import { FormField } from "@/components/app/form-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { createContractAction } from "@/app/(admin)/amc/actions";
import type { ActionState } from "@/lib/action";

import { FormDialog } from "./form-dialog";
import { oneYearEnd, planLabel } from "./format";

type Option = { value: string; label: string };

const planOptions = Object.entries(planLabel).map(([value, label]) => ({ value, label }));

function paymentPreview(value: string, paid: string): string {
  const v = Number(value) || 0;
  const p = Number(paid) || 0;
  if (v <= 0 || p >= v) return "Paid";
  return p > 0 ? "Partial" : "Unpaid";
}

function ContractFields({ state, installations, today }: { state: ActionState; installations: Option[]; today: string }) {
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(oneYearEnd(today));
  const [endTouched, setEndTouched] = useState(false);
  const [value, setValue] = useState("");
  const [paid, setPaid] = useState("");
  const e = (k: string) => state.fieldErrors?.[k];

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <FormField label="Plant" htmlFor="k-inst" error={e("installationId")} required className="sm:col-span-2">
        <NativeSelect id="k-inst" name="installationId" required defaultValue={installations[0]?.value ?? ""} options={installations} />
      </FormField>
      <FormField label="Plan" htmlFor="k-plan" error={e("plan")} required>
        <NativeSelect id="k-plan" name="plan" defaultValue="comprehensive" options={planOptions} />
      </FormField>
      <FormField label="Contract no." htmlFor="k-no" error={e("contractNo")} hint="Leave blank to auto-number">
        <Input id="k-no" name="contractNo" maxLength={30} placeholder="AMC-YYYY-0001" />
      </FormField>
      <FormField label="Start" htmlFor="k-start" error={e("startOn")} required>
        <Input
          id="k-start"
          name="startOn"
          type="date"
          required
          value={start}
          onChange={(ev) => {
            setStart(ev.target.value);
            if (!endTouched && ev.target.value) setEnd(oneYearEnd(ev.target.value));
          }}
        />
      </FormField>
      <FormField label="End" htmlFor="k-end" error={e("endOn")} required>
        <Input
          id="k-end"
          name="endOn"
          type="date"
          required
          min={start}
          value={end}
          onChange={(ev) => {
            setEnd(ev.target.value);
            setEndTouched(true);
          }}
        />
      </FormField>
      <FormField label="Service visits per year" htmlFor="k-visits" error={e("visitsPerYear")} required>
        <Input id="k-visits" name="visitsPerYear" type="number" min={0} max={52} required defaultValue={4} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Filter every (days)" htmlFor="k-filter" error={e("filterChangeEveryDays")}>
          <Input id="k-filter" name="filterChangeEveryDays" type="number" min={1} max={3650} placeholder="90" />
        </FormField>
        <FormField label="Membrane every (days)" htmlFor="k-membrane" error={e("membraneChangeEveryDays")}>
          <Input id="k-membrane" name="membraneChangeEveryDays" type="number" min={1} max={3650} placeholder="730" />
        </FormField>
      </div>
      <FormField label="Contract value (₹)" htmlFor="k-value" error={e("value")} required>
        <Input
          id="k-value"
          name="value"
          type="number"
          min={0}
          step="0.01"
          required
          value={value}
          onChange={(ev) => setValue(ev.target.value)}
        />
      </FormField>
      <FormField label="Amount paid (₹)" htmlFor="k-paid" error={e("amountPaid")} hint={`Payment status: ${paymentPreview(value, paid)}`}>
        <Input id="k-paid" name="amountPaid" type="number" min={0} step="0.01" value={paid} onChange={(ev) => setPaid(ev.target.value)} />
      </FormField>
      <FormField label="Notes" htmlFor="k-notes" error={e("notes")} className="sm:col-span-2">
        <Textarea id="k-notes" name="notes" rows={2} maxLength={2000} />
      </FormField>
    </div>
  );
}

export function AddContractDialog({ installations, today }: { installations: Option[]; today: string }) {
  if (!installations.length) {
    return (
      <Button size="sm" disabled title="Add a plant first">
        <PlusIcon /> Contract
      </Button>
    );
  }
  return (
    <FormDialog
      action={createContractAction}
      title="New AMC contract"
      description="Service visits are scheduled automatically and the client gets a confirmation SMS."
      submitLabel="Create contract"
      pendingLabel="Creating…"
      trigger={
        <Button size="sm">
          <PlusIcon /> Contract
        </Button>
      }
    >
      {(state) => <ContractFields state={state} installations={installations} today={today} />}
    </FormDialog>
  );
}
