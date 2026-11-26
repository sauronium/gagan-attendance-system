"use client";

import { useActionState, useCallback, useState } from "react";

import { FormError, FormField, SubmitButton, useActionToast } from "@/components/app/form-bits";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { initialActionState } from "@/lib/action";

import { requestCorrectionAction } from "./actions";

const typeOptions = [
  { value: "missed_check_in", label: "Missed check-in" },
  { value: "missed_check_out", label: "Missed check-out" },
  { value: "wrong_status", label: "Wrong status" },
  { value: "on_duty", label: "On duty outside office" },
];

/** "Request correction" button + dialog for one day. */
export function CorrectionDialog({
  date,
  dateLabel,
  defaultType,
  checkIn,
  checkOut,
}: {
  date: string;
  dateLabel: string;
  defaultType: string;
  /** Existing punches as HH:MM (pre-filled). */
  checkIn?: string;
  checkOut?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(requestCorrectionAction, initialActionState);
  const close = useCallback(() => setOpen(false), []);
  useActionToast(state, close);
  const fe = state.fieldErrors ?? {};
  const id = (s: string) => `rc-${date}-${s}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="ghost" className="h-8 px-2 text-xs">
            Request correction
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <form action={action} className="flex flex-col gap-3">
          <DialogHeader>
            <DialogTitle>Request correction</DialogTitle>
            <DialogDescription>{dateLabel} · an admin will review it.</DialogDescription>
          </DialogHeader>
          <input type="hidden" name="date" value={date} />
          <FormField label="What needs fixing?" htmlFor={id("type")} error={fe.type} required>
            <NativeSelect
              id={id("type")}
              name="type"
              defaultValue={defaultType}
              options={typeOptions}
              className="[&_select]:h-11"
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Check-in time" htmlFor={id("in")} error={fe.checkIn}>
              <Input id={id("in")} name="checkIn" type="time" defaultValue={checkIn} className="h-11" />
            </FormField>
            <FormField label="Check-out time" htmlFor={id("out")} error={fe.checkOut}>
              <Input id={id("out")} name="checkOut" type="time" defaultValue={checkOut} className="h-11" />
            </FormField>
          </div>
          <FormField label="Reason" htmlFor={id("reason")} error={fe.reason} required>
            <Textarea
              id={id("reason")}
              name="reason"
              rows={3}
              required
              maxLength={500}
              placeholder="e.g. Phone battery died, left at 6:45 PM"
            />
          </FormField>
          <FormError state={state} />
          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" onClick={close}>
              Cancel
            </Button>
            <SubmitButton className="h-11" pendingLabel="Sending…">
              Send request
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
