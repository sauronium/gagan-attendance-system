"use client";

import { type ReactNode, useActionState, useCallback, useState } from "react";

import { FormError, FormField, SubmitButton, useActionToast } from "@/components/app/form-bits";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { type ActionState, initialActionState } from "@/lib/action";

import {
  saveDepartmentAction,
  saveLeaveTypeAction,
  saveLocationAction,
  savePolicyAction,
  savePolicyTypeAction,
  saveShiftAction,
} from "./actions";
import { useCloseDialog } from "./form-dialog";

// Add / edit forms for the Settings tabs. Each form is used twice: inline
// in the "Add" card (no `initial`) and inside a FormDialog for editing.

type Option = { value: string; label: string };
type ServerAction = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/**
 * Shared wiring: action state, toast, close the surrounding dialog on
 * success, and remount the fields (via `formKey`) so an add form starts
 * blank again, including Base UI checkboxes that a native reset misses.
 */
function useSettingsForm(action: ServerAction) {
  const close = useCloseDialog();
  const [state, formAction] = useActionState(action, initialActionState);
  const [formKey, setFormKey] = useState(0);
  const onSuccess = useCallback(() => {
    setFormKey((k) => k + 1);
    close();
  }, [close]);
  useActionToast(state, onSuccess);
  return { state, formAction, formKey, fe: state.fieldErrors ?? {} };
}

function Actions({ state, label }: { state: ActionState; label: string }) {
  return (
    <>
      <FormError state={state} />
      <SubmitButton size="lg">{label}</SubmitButton>
    </>
  );
}

function CheckField({ id, name, label, defaultChecked, value }: { id: string; name: string; label: ReactNode; defaultChecked?: boolean; value?: string }) {
  return (
    <div className="flex h-9 items-center gap-2">
      <Checkbox id={id} name={name} value={value} defaultChecked={defaultChecked} />
      <Label htmlFor={id} className="font-normal">{label}</Label>
    </div>
  );
}

// ── Shift ────────────────────────────────────────────────────

export type ShiftValues = {
  id: number;
  name: string;
  startTime: string;
  endTime: string;
  crossesMidnight: boolean;
  breakMinutes: number;
  graceMinutes: number;
  halfDayAfter: string | null;
  halfDayBelowMinutes: number;
  absentBelowMinutes: number;
  overtimeAfterMinutes: number;
  latesPerHalfDay: number;
  weeklyOffs: number[];
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function ShiftForm({ initial }: { initial?: ShiftValues }) {
  const { state, formAction, formKey, fe } = useSettingsForm(saveShiftAction);
  const p = initial ? `s${initial.id}` : "s-new";
  const offs = new Set(initial?.weeklyOffs ?? [0]);
  const hm = (t: string | null | undefined) => (t ? t.slice(0, 5) : "");

  return (
    <form key={formKey} action={formAction} className="flex flex-col gap-3">
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      <FormField label="Shift name" htmlFor={`${p}-name`} error={fe.name} required>
        <Input id={`${p}-name`} name="name" defaultValue={initial?.name} maxLength={100} required placeholder="General shift" />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Starts" htmlFor={`${p}-start`} error={fe.startTime} required>
          <Input id={`${p}-start`} name="startTime" type="time" defaultValue={hm(initial?.startTime) || "09:30"} required />
        </FormField>
        <FormField label="Ends" htmlFor={`${p}-end`} error={fe.endTime} required>
          <Input id={`${p}-end`} name="endTime" type="time" defaultValue={hm(initial?.endTime) || "18:30"} required />
        </FormField>
      </div>
      <CheckField id={`${p}-night`} name="crossesMidnight" label="Ends after midnight (night shift)" defaultChecked={initial?.crossesMidnight} />
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Break (min)" htmlFor={`${p}-break`} error={fe.breakMinutes} required>
          <Input id={`${p}-break`} name="breakMinutes" type="number" min={0} max={600} defaultValue={initial?.breakMinutes ?? 60} required />
        </FormField>
        <FormField label="Grace (min)" htmlFor={`${p}-grace`} error={fe.graceMinutes} hint="Late after start + grace" required>
          <Input id={`${p}-grace`} name="graceMinutes" type="number" min={0} max={600} defaultValue={initial?.graceMinutes ?? 15} required />
        </FormField>
        <FormField label="Half-day if in after" htmlFor={`${p}-hda`} error={fe.halfDayAfter} hint="Optional">
          <Input id={`${p}-hda`} name="halfDayAfter" type="time" defaultValue={hm(initial ? initial.halfDayAfter : "11:00")} />
        </FormField>
        <FormField label="Lates per half-day cut" htmlFor={`${p}-lates`} error={fe.latesPerHalfDay} hint="0 = rule off" required>
          <Input id={`${p}-lates`} name="latesPerHalfDay" type="number" min={0} max={31} defaultValue={initial?.latesPerHalfDay ?? 3} required />
        </FormField>
        <FormField label="Half-day below (min worked)" htmlFor={`${p}-hdb`} error={fe.halfDayBelowMinutes} required>
          <Input id={`${p}-hdb`} name="halfDayBelowMinutes" type="number" min={0} max={1440} defaultValue={initial?.halfDayBelowMinutes ?? 270} required />
        </FormField>
        <FormField label="Absent below (min worked)" htmlFor={`${p}-ab`} error={fe.absentBelowMinutes} required>
          <Input id={`${p}-ab`} name="absentBelowMinutes" type="number" min={0} max={1440} defaultValue={initial?.absentBelowMinutes ?? 120} required />
        </FormField>
        <FormField label="Overtime after end + (min)" htmlFor={`${p}-ot`} error={fe.overtimeAfterMinutes} required className="col-span-2">
          <Input id={`${p}-ot`} name="overtimeAfterMinutes" type="number" min={0} max={1440} defaultValue={initial?.overtimeAfterMinutes ?? 30} required />
        </FormField>
      </div>
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Weekly offs</legend>
        <div className="flex flex-wrap gap-x-4">
          {WEEKDAYS.map((d, i) => (
            <CheckField key={d} id={`${p}-off-${i}`} name="weeklyOffs" value={String(i)} label={d} defaultChecked={offs.has(i)} />
          ))}
        </div>
      </fieldset>
      <Actions state={state} label={initial ? "Save shift" : "Add shift"} />
    </form>
  );
}

// ── Office location ──────────────────────────────────────────

export type LocationValues = { id: number; name: string; address: string | null; lat: number; lng: number; radiusM: number };

export function LocationForm({ initial }: { initial?: LocationValues }) {
  const { state, formAction, formKey, fe } = useSettingsForm(saveLocationAction);
  const p = initial ? `l${initial.id}` : "l-new";
  return (
    <form key={formKey} action={formAction} className="flex flex-col gap-3">
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      <FormField label="Name" htmlFor={`${p}-name`} error={fe.name} required>
        <Input id={`${p}-name`} name="name" defaultValue={initial?.name} maxLength={100} required placeholder="Head office" />
      </FormField>
      <FormField label="Address" htmlFor={`${p}-addr`} error={fe.address}>
        <Input id={`${p}-addr`} name="address" defaultValue={initial?.address ?? ""} maxLength={255} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Latitude" htmlFor={`${p}-lat`} error={fe.lat} required>
          <Input id={`${p}-lat`} name="lat" type="number" step="0.0000001" min={-90} max={90} defaultValue={initial?.lat} required inputMode="decimal" />
        </FormField>
        <FormField label="Longitude" htmlFor={`${p}-lng`} error={fe.lng} required>
          <Input id={`${p}-lng`} name="lng" type="number" step="0.0000001" min={-180} max={180} defaultValue={initial?.lng} required inputMode="decimal" />
        </FormField>
      </div>
      <FormField label="Check-in radius (m)" htmlFor={`${p}-radius`} error={fe.radiusM} hint="Check-ins further away are flagged" required>
        <Input id={`${p}-radius`} name="radiusM" type="number" min={10} max={5000} defaultValue={initial?.radiusM ?? 150} required />
      </FormField>
      <Actions state={state} label={initial ? "Save location" : "Add location"} />
    </form>
  );
}

// ── Department ───────────────────────────────────────────────

export type DepartmentValues = { id: number; name: string; headEmployeeId: number | null };

export function DepartmentForm({ initial, employees }: { initial?: DepartmentValues; employees: Option[] }) {
  const { state, formAction, formKey, fe } = useSettingsForm(saveDepartmentAction);
  const p = initial ? `d${initial.id}` : "d-new";
  return (
    <form key={formKey} action={formAction} className="flex flex-col gap-3">
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      <FormField label="Name" htmlFor={`${p}-name`} error={fe.name} required>
        <Input id={`${p}-name`} name="name" defaultValue={initial?.name} maxLength={100} required placeholder="Service" />
      </FormField>
      <FormField label="Head" htmlFor={`${p}-head`} error={fe.headEmployeeId}>
        <NativeSelect
          id={`${p}-head`}
          name="headEmployeeId"
          defaultValue={initial?.headEmployeeId ? String(initial.headEmployeeId) : ""}
          placeholder="No head"
          options={employees}
        />
      </FormField>
      <Actions state={state} label={initial ? "Save department" : "Add department"} />
    </form>
  );
}

// ── Leave type ───────────────────────────────────────────────

export type LeaveTypeValues = { id: number; code: string; name: string; isPaid: boolean };

export function LeaveTypeForm({ initial }: { initial?: LeaveTypeValues }) {
  const { state, formAction, formKey, fe } = useSettingsForm(saveLeaveTypeAction);
  const p = initial ? `lt${initial.id}` : "lt-new";
  return (
    <form key={formKey} action={formAction} className="flex flex-col gap-3">
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      <div className="grid grid-cols-[6rem_1fr] gap-3">
        <FormField label="Code" htmlFor={`${p}-code`} error={fe.code} required>
          <Input id={`${p}-code`} name="code" defaultValue={initial?.code} maxLength={10} required placeholder="CL" className="uppercase" />
        </FormField>
        <FormField label="Name" htmlFor={`${p}-name`} error={fe.name} required>
          <Input id={`${p}-name`} name="name" defaultValue={initial?.name} maxLength={60} required placeholder="Casual leave" />
        </FormField>
      </div>
      <CheckField id={`${p}-paid`} name="isPaid" label="Paid leave (uses balance)" defaultChecked={initial?.isPaid ?? true} />
      <Actions state={state} label={initial ? "Save leave type" : "Add leave type"} />
    </form>
  );
}

// ── Leave policy ─────────────────────────────────────────────

export function PolicyForm({ initial }: { initial?: { id: number; name: string } }) {
  const { state, formAction, formKey, fe } = useSettingsForm(savePolicyAction);
  const p = initial ? `p${initial.id}` : "p-new";
  return (
    <form key={formKey} action={formAction} className="flex flex-col gap-3">
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      <FormField label="Policy name" htmlFor={`${p}-name`} error={fe.name} required>
        <Input id={`${p}-name`} name="name" defaultValue={initial?.name} maxLength={100} required placeholder="Standard staff policy" />
      </FormField>
      <Actions state={state} label={initial ? "Rename policy" : "Add policy"} />
    </form>
  );
}

export type PolicyTypeValues = {
  leaveTypeId: number;
  yearlyQuota: number;
  accrual: string;
  carryForwardMax: number;
  minNoticeDays: number;
  maxContinuousDays: number | null;
  documentAfterDays: number | null;
  expiresAfterDays: number | null;
};

const ACCRUAL_OPTIONS = [
  { value: "yearly", label: "Yearly (credited on 1 Jan)" },
  { value: "monthly", label: "Monthly (1/12 each month)" },
  { value: "none", label: "None (granted manually)" },
];

/** Sets one leave type's rules inside a policy (adds it if missing). */
export function PolicyTypeForm({
  policyId,
  initial,
  leaveTypes,
}: {
  policyId: number;
  initial?: PolicyTypeValues;
  /** Choices when adding; ignored when editing an existing row. */
  leaveTypes: Option[];
}) {
  const { state, formAction, formKey, fe } = useSettingsForm(savePolicyTypeAction);
  const p = `pt${policyId}-${initial?.leaveTypeId ?? "new"}`;
  return (
    <form key={formKey} action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="policyId" value={policyId} />
      {initial ? (
        <input type="hidden" name="leaveTypeId" value={initial.leaveTypeId} />
      ) : (
        <FormField label="Leave type" htmlFor={`${p}-type`} error={fe.leaveTypeId} required>
          <NativeSelect id={`${p}-type`} name="leaveTypeId" placeholder="Choose…" options={leaveTypes} required />
        </FormField>
      )}
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Yearly quota (days)" htmlFor={`${p}-quota`} error={fe.yearlyQuota} required>
          <Input id={`${p}-quota`} name="yearlyQuota" type="number" step="0.25" min={0} max={366} defaultValue={initial?.yearlyQuota ?? 12} required />
        </FormField>
        <FormField label="Accrual" htmlFor={`${p}-accrual`} error={fe.accrual} required>
          <NativeSelect id={`${p}-accrual`} name="accrual" defaultValue={initial?.accrual ?? "yearly"} options={ACCRUAL_OPTIONS} />
        </FormField>
        <FormField label="Carry forward max" htmlFor={`${p}-cf`} error={fe.carryForwardMax} hint="0 = lapses" required>
          <Input id={`${p}-cf`} name="carryForwardMax" type="number" step="0.25" min={0} max={366} defaultValue={initial?.carryForwardMax ?? 0} required />
        </FormField>
        <FormField label="Notice (days)" htmlFor={`${p}-notice`} error={fe.minNoticeDays} required>
          <Input id={`${p}-notice`} name="minNoticeDays" type="number" min={0} max={255} defaultValue={initial?.minNoticeDays ?? 0} required />
        </FormField>
        <FormField label="Max continuous" htmlFor={`${p}-max`} error={fe.maxContinuousDays} hint="Optional">
          <Input id={`${p}-max`} name="maxContinuousDays" type="number" min={0} max={255} defaultValue={initial?.maxContinuousDays ?? ""} />
        </FormField>
        <FormField label="Document after (days)" htmlFor={`${p}-doc`} error={fe.documentAfterDays} hint="Optional">
          <Input id={`${p}-doc`} name="documentAfterDays" type="number" min={0} max={255} defaultValue={initial?.documentAfterDays ?? ""} />
        </FormField>
        <FormField label="Credits expire after (days)" htmlFor={`${p}-exp`} error={fe.expiresAfterDays} hint="Optional, e.g. comp-off" className="col-span-2">
          <Input id={`${p}-exp`} name="expiresAfterDays" type="number" min={0} max={65535} defaultValue={initial?.expiresAfterDays ?? ""} />
        </FormField>
      </div>
      <Actions state={state} label={initial ? "Save rules" : "Set quota"} />
    </form>
  );
}
