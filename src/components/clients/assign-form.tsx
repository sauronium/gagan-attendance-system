"use client";

import { useActionState } from "react";

import { SubmitButton, useActionToast } from "@/components/app/form-bits";
import { NativeSelect } from "@/components/ui/native-select";
import { assignVisitAction } from "@/app/(admin)/amc/actions";
import { initialActionState } from "@/lib/action";

type Option = { value: string; label: string };

/** Inline technician picker for a scheduled service visit. */
export function AssignTechForm({
  visitId,
  technicianId,
  technicians,
}: {
  visitId: number;
  technicianId: number | null;
  technicians: Option[];
}) {
  const [state, action] = useActionState(assignVisitAction, initialActionState);
  useActionToast(state);
  const selectId = `assign-${visitId}`;
  return (
    <form action={action} className="flex min-w-48 items-center gap-1.5">
      <input type="hidden" name="visitId" value={visitId} />
      <label htmlFor={selectId} className="sr-only">
        Technician
      </label>
      <NativeSelect
        id={selectId}
        name="technicianId"
        required
        defaultValue={technicianId ? String(technicianId) : ""}
        placeholder="Pick technician"
        options={technicians}
        className="min-w-0 flex-1"
      />
      <SubmitButton size="sm" variant="outline" pendingLabel="…">
        {technicianId ? "Change" : "Assign"}
      </SubmitButton>
    </form>
  );
}
