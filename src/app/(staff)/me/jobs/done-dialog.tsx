"use client";

import { CameraIcon, CheckIcon, XIcon } from "lucide-react";
import { useActionState, useCallback, useState } from "react";

import { FormError, FormField, SubmitButton, useActionToast, useToastedAction } from "@/components/app/form-bits";
import { CameraCapture } from "@/components/staff/camera-capture";
import { GpsStatus } from "@/components/staff/gps-status";
import { useGeolocation } from "@/components/staff/use-geolocation";
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
import { Textarea } from "@/components/ui/textarea";
import { initialActionState } from "@/lib/action";

import { completeJobAction } from "./actions";

/** "Mark done" button + dialog for one service visit. */
export function DoneDialog({
  visitId,
  clientName,
  defaultNextDue,
  minNextDue,
  watermark,
}: {
  visitId: number;
  clientName: string;
  /** Suggested next service date (AMC: due + 3 months). */
  defaultNextDue?: string;
  minNextDue: string;
  watermark: string;
}) {
  const [open, setOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const geo = useGeolocation({ enabled: open && photoOpen });
  const [state, action] = useActionState(useToastedAction(completeJobAction), initialActionState);
  const close = useCallback(() => {
    setOpen(false);
    setPhoto(null);
    setPhotoOpen(false);
  }, []);
  useActionToast(state, close, { silent: true });
  const fe = state.fieldErrors ?? {};
  const id = (s: string) => `job-${visitId}-${s}`;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <DialogTrigger
        render={
          <Button className="h-11 flex-1">
            <CheckIcon /> Mark done
          </Button>
        }
      />
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
        <form action={action} className="flex flex-col gap-3">
          <DialogHeader>
            <DialogTitle>Mark job done</DialogTitle>
            <DialogDescription>{clientName}</DialogDescription>
          </DialogHeader>
          <input type="hidden" name="id" value={visitId} />
          <FormField label="Work done" htmlFor={id("notes")} error={fe.notes}>
            <Textarea id={id("notes")} name="notes" rows={3} maxLength={2000} placeholder="Cleaned filters, checked TDS…" />
          </FormField>
          <FormField
            label="Parts used"
            htmlFor={id("parts")}
            error={fe.parts}
            hint="Separate with commas, e.g. Filter x1, Membrane x1"
          >
            <Textarea id={id("parts")} name="parts" rows={2} maxLength={1000} placeholder="Filter x1, Membrane x1" />
          </FormField>
          <FormField label="Next service due" htmlFor={id("next")} error={fe.nextDueOn}>
            <Input
              id={id("next")}
              name="nextDueOn"
              type="date"
              min={minNextDue}
              defaultValue={defaultNextDue}
              className="h-11"
            />
          </FormField>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Photo (optional)</span>
            {photoOpen ? (
              <>
                <CameraCapture
                  facingMode="environment"
                  label={watermark}
                  coords={geo.coords}
                  value={photo}
                  onChange={setPhoto}
                  name="photo"
                />
                <GpsStatus geo={geo} />
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setPhoto(null);
                    setPhotoOpen(false);
                  }}
                >
                  <XIcon /> Remove photo
                </Button>
              </>
            ) : (
              <Button type="button" variant="outline" className="h-11" onClick={() => setPhotoOpen(true)}>
                <CameraIcon /> Add photo
              </Button>
            )}
          </div>

          <FormError state={state} />
          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" onClick={close}>
              Cancel
            </Button>
            <SubmitButton className="h-11" disabled={photoOpen && !photo} pendingLabel="Saving…">
              Mark done
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
