"use client";

import { Loader2Icon } from "lucide-react";
import { type FormEvent, startTransition, useActionState } from "react";

import { FormError, FormField, useActionToast } from "@/components/app/form-bits";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { type ActionState, initialActionState } from "@/lib/action";

type Option = { value: string; label: string };

export type EmployeeFormValues = {
  id?: number;
  name: string;
  empCode: string;
  mobile: string;
  email: string;
  role: string;
  departmentId: string;
  designation: string;
  shiftId: string;
  managerId: string;
  leavePolicyId: string;
  workType: string;
  joinedOn: string;
  locationIds: string[];
};

export function EmployeeForm({
  action,
  values,
  withPassword,
  submitLabel,
  options,
  disabled,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  values: EmployeeFormValues;
  /** Show the initial password field (new employees). */
  withPassword?: boolean;
  submitLabel: string;
  options: {
    roles: Option[];
    departments: Option[];
    shifts: Option[];
    managers: Option[];
    policies: Option[];
    workTypes: Option[];
    locations: Option[];
  };
  disabled?: boolean;
}) {
  const [state, dispatch, pending] = useActionState(action, initialActionState);
  useActionToast(state);
  const err = state.fieldErrors ?? {};

  // Submit without React's automatic form reset, so typed values survive a
  // validation error.
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" aria-busy={pending}>
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <fieldset disabled={disabled || pending} className="grid gap-4 sm:grid-cols-2">
        <legend className="sr-only">Employee details</legend>
        <FormField label="Full name" htmlFor="e-name" error={err.name} required>
          <Input id="e-name" name="name" required maxLength={120} defaultValue={values.name} autoComplete="off" />
        </FormField>
        <FormField label="Employee code" htmlFor="e-code" error={err.empCode} required>
          <Input id="e-code" name="empCode" required maxLength={20} defaultValue={values.empCode} placeholder="AG042" />
        </FormField>
        <FormField label="Mobile number" htmlFor="e-mobile" error={err.mobile} required hint="Used to sign in. 10-digit Indian numbers are fine.">
          <Input id="e-mobile" name="mobile" type="tel" inputMode="tel" required maxLength={20} defaultValue={values.mobile} placeholder="98123 45678" />
        </FormField>
        <FormField label="Email" htmlFor="e-email" error={err.email}>
          <Input id="e-email" name="email" type="email" maxLength={191} defaultValue={values.email} />
        </FormField>
        <FormField label="Role" htmlFor="e-role" error={err.role} required>
          <NativeSelect id="e-role" name="role" required defaultValue={values.role} options={options.roles} />
        </FormField>
        <FormField label="Work type" htmlFor="e-work" error={err.workType} required>
          <NativeSelect id="e-work" name="workType" required defaultValue={values.workType} options={options.workTypes} />
        </FormField>
        <FormField label="Department" htmlFor="e-dept" error={err.departmentId}>
          <NativeSelect id="e-dept" name="departmentId" defaultValue={values.departmentId} placeholder="None" options={options.departments} />
        </FormField>
        <FormField label="Designation" htmlFor="e-desig" error={err.designation}>
          <Input id="e-desig" name="designation" maxLength={100} defaultValue={values.designation} placeholder="Service engineer" />
        </FormField>
        <FormField label="Shift" htmlFor="e-shift" error={err.shiftId} hint="Without a shift the default 9:30–6:30 rules apply.">
          <NativeSelect id="e-shift" name="shiftId" defaultValue={values.shiftId} placeholder="Default shift" options={options.shifts} />
        </FormField>
        <FormField label="Reporting manager" htmlFor="e-mgr" error={err.managerId} hint="Approves leave and corrections.">
          <NativeSelect id="e-mgr" name="managerId" defaultValue={values.managerId} placeholder="None" options={options.managers} />
        </FormField>
        <FormField label="Leave policy" htmlFor="e-policy" error={err.leavePolicyId} hint={withPassword ? "This year's balances are credited from the policy." : undefined}>
          <NativeSelect id="e-policy" name="leavePolicyId" defaultValue={values.leavePolicyId} placeholder="None" options={options.policies} />
        </FormField>
        <FormField label="Joined on" htmlFor="e-joined" error={err.joinedOn}>
          <Input id="e-joined" name="joinedOn" type="date" defaultValue={values.joinedOn} />
        </FormField>

        <fieldset className="flex flex-col gap-2 sm:col-span-2">
          <legend className="mb-1.5 text-sm font-medium">Allowed office locations</legend>
          {options.locations.length ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {options.locations.map((l) => (
                <div key={l.value} className="flex items-center gap-2">
                  <Checkbox
                    id={`e-loc-${l.value}`}
                    name="locationIds"
                    value={l.value}
                    defaultChecked={values.locationIds.includes(l.value)}
                  />
                  <Label htmlFor={`e-loc-${l.value}`} className="font-normal">
                    {l.label}
                  </Label>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No office locations set up yet.</p>
          )}
          <p className="text-xs text-muted-foreground">Check-ins away from these are flagged. Leave all unticked for field staff who can check in anywhere.</p>
        </fieldset>

        {withPassword ? (
          <FormField
            label="Initial password"
            htmlFor="e-password"
            error={err.password}
            required
            hint="At least 8 characters. Share it with the employee privately."
          >
            <Input id="e-password" name="password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" />
          </FormField>
        ) : null}
      </fieldset>

      <FormError state={state} />
      {!disabled ? (
        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? <Loader2Icon className="animate-spin" /> : null}
            {pending ? "Saving…" : submitLabel}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
