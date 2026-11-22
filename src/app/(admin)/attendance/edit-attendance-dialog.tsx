"use client";

import { PencilIcon } from "lucide-react";
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

import { editAttendanceAction } from "./actions";

export function EditAttendanceDialog({
  employeeId,
  employeeName,
  date,
  dateLabel,
  status,
  checkIn,
  checkOut,
  note,
  statusOptions,
}: {
  employeeId: number;
  employeeName: string;
  date: string;
  dateLabel: string;
  status: string | null;
  checkIn: string;
  checkOut: string;
  note: string;
  statusOptions: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(editAttendanceAction, initialActionState);
  const close = useCallback(() => setOpen(false), []);
  useActionToast(state, close);
  const id = `ea-${employeeId}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="ghost" aria-label={`Edit attendance for ${employeeName}`}>
            <PencilIcon />
            <span className="hidden sm:inline">Edit</span>
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <form action={formAction} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Edit attendance</DialogTitle>
            <DialogDescription>
              {employeeName} · {dateLabel}
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="employeeId" value={employeeId} />
          <input type="hidden" name="date" value={date} />

          <FormField
            label="Status"
            htmlFor={`${id}-status`}
            error={state.fieldErrors?.status}
            hint="Leave on automatic to work it out from the times and shift rules."
          >
            <NativeSelect
              id={`${id}-status`}
              name="status"
              defaultValue=""
              placeholder={status ? "Automatic (keep or recalculate)" : "Automatic (from times)"}
              options={statusOptions}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Check-in" htmlFor={`${id}-in`} error={state.fieldErrors?.checkIn}>
              <Input id={`${id}-in`} name="checkIn" type="time" defaultValue={checkIn} />
            </FormField>
            <FormField label="Check-out" htmlFor={`${id}-out`} error={state.fieldErrors?.checkOut}>
              <Input id={`${id}-out`} name="checkOut" type="time" defaultValue={checkOut} />
            </FormField>
          </div>
          <FormField label="Note" htmlFor={`${id}-note`} error={state.fieldErrors?.note} hint="Shown on the attendance record.">
            <Input id={`${id}-note`} name="note" maxLength={255} defaultValue={note} />
          </FormField>
          <FormField label="Reason for the change" htmlFor={`${id}-reason`} error={state.fieldErrors?.reason} required>
            <Textarea
              id={`${id}-reason`}
              name="reason"
              rows={2}
              required
              maxLength={255}
              placeholder="Kept in the audit log"
            />
          </FormField>
          <FormError state={state} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
