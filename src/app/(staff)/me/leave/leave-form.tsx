"use client";

import { useActionState, useCallback, useRef, useState } from "react";

import { FormError, FormField, SubmitButton, useActionToast } from "@/components/app/form-bits";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { initialActionState } from "@/lib/action";

import { applyLeaveAction } from "./actions";

type Option = { value: string; label: string };

export function LeaveForm({ typeOptions, today }: { typeOptions: Option[]; today: string }) {
  const ref = useRef<HTMLFormElement>(null);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [state, action] = useActionState(applyLeaveAction, initialActionState);
  const reset = useCallback(() => {
    ref.current?.reset();
    setFrom(today);
    setTo(today);
  }, [today]);
  useActionToast(state, reset);
  const fe = state.fieldErrors ?? {};
  const singleDay = from !== "" && from === to;

  return (
    <form ref={ref} action={action} className="flex flex-col gap-3">
      <FormField label="Leave type" htmlFor="lv-type" error={fe.leaveTypeId} required>
        <NativeSelect
          id="lv-type"
          name="leaveTypeId"
          required
          placeholder="Choose leave type"
          options={typeOptions}
          className="[&_select]:h-11"
        />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="From" htmlFor="lv-from" error={fe.fromDate} required>
          <Input
            id="lv-from"
            name="fromDate"
            type="date"
            required
            value={from}
            onChange={(e) => {
              const v = e.target.value;
              setFrom(v);
              if (!to || to < v) setTo(v);
            }}
            className="h-11"
          />
        </FormField>
        <FormField label="To" htmlFor="lv-to" error={fe.toDate} required>
          <Input
            id="lv-to"
            name="toDate"
            type="date"
            required
            min={from || undefined}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-11"
          />
        </FormField>
      </div>
      {singleDay ? (
        <FormField label="Duration" htmlFor="lv-half" error={fe.halfDay}>
          <NativeSelect
            id="lv-half"
            name="halfDay"
            defaultValue=""
            className="[&_select]:h-11"
            options={[
              { value: "", label: "Full day" },
              { value: "first_half", label: "Half-day · first half" },
              { value: "second_half", label: "Half-day · second half" },
            ]}
          />
        </FormField>
      ) : null}
      <FormField label="Reason" htmlFor="lv-reason" error={fe.reason}>
        <Textarea id="lv-reason" name="reason" rows={3} maxLength={500} placeholder="Optional" />
      </FormField>
      <FormError state={state} />
      <SubmitButton className="h-11" pendingLabel="Sending…">
        Apply for leave
      </SubmitButton>
      <p className="text-xs text-muted-foreground">Weekly offs and holidays are not counted.</p>
    </form>
  );
}
