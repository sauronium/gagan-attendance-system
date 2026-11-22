"use client";

import { PlusIcon } from "lucide-react";

import { FormField } from "@/components/app/form-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { createComplaintAction } from "@/app/(admin)/complaints/actions";

import { FormDialog } from "./form-dialog";

type Option = { value: string; label: string };

const priorityOptions = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

export function NewComplaintDialog({ installations, size = "default" }: { installations: Option[]; size?: "default" | "sm" }) {
  if (!installations.length) {
    return (
      <Button size={size} disabled title="Add a plant first">
        <PlusIcon /> New complaint
      </Button>
    );
  }
  return (
    <FormDialog
      action={createComplaintAction}
      title="New complaint"
      description="The client gets the ticket number by SMS."
      submitLabel="Log complaint"
      pendingLabel="Logging…"
      trigger={
        <Button size={size}>
          <PlusIcon /> New complaint
        </Button>
      }
    >
      {(state) => (
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Plant" htmlFor="cm-inst" error={state.fieldErrors?.installationId} required className="sm:col-span-2">
            <NativeSelect
              id="cm-inst"
              name="installationId"
              required
              defaultValue={installations.length === 1 ? installations[0].value : ""}
              placeholder={installations.length === 1 ? undefined : "Pick a plant"}
              options={installations}
            />
          </FormField>
          <FormField label="Priority" htmlFor="cm-priority" error={state.fieldErrors?.priority} required>
            <NativeSelect id="cm-priority" name="priority" defaultValue="normal" options={priorityOptions} />
          </FormField>
          <FormField
            label="Due by"
            htmlFor="cm-due"
            error={state.fieldErrors?.dueBy}
            hint="Blank: urgent 4 h, high 24 h, normal 48 h, low 72 h"
          >
            <Input id="cm-due" name="dueBy" type="datetime-local" />
          </FormField>
          <FormField label="Issue" htmlFor="cm-issue" error={state.fieldErrors?.issue} required className="sm:col-span-2">
            <Textarea id="cm-issue" name="issue" rows={3} required maxLength={2000} placeholder="Low output, leakage, TDS high…" />
          </FormField>
        </div>
      )}
    </FormDialog>
  );
}
