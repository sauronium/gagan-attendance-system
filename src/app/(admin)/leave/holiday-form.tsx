"use client";

import { useActionState, useRef } from "react";

import { FormField, SubmitButton, useActionToast } from "@/components/app/form-bits";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialActionState } from "@/lib/action";

import { addHolidayAction } from "./actions";

export function HolidayForm() {
  const ref = useRef<HTMLFormElement>(null);
  const [state, action] = useActionState(addHolidayAction, initialActionState);
  useActionToast(state, () => ref.current?.reset());
  return (
    <form ref={ref} action={action} className="flex flex-col gap-3">
      <FormField label="Date" htmlFor="h-date" error={state.fieldErrors?.date} required>
        <Input id="h-date" name="date" type="date" required />
      </FormField>
      <FormField label="Holiday name" htmlFor="h-name" error={state.fieldErrors?.name} required>
        <Input id="h-name" name="name" required maxLength={100} placeholder="Diwali" />
      </FormField>
      <div className="flex h-9 items-center gap-2">
        <Checkbox id="h-opt" name="isOptional" />
        <Label htmlFor="h-opt" className="font-normal">Optional</Label>
      </div>
      <SubmitButton size="lg">Add holiday</SubmitButton>
    </form>
  );
}
