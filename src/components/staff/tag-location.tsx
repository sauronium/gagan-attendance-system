"use client";

import { CameraIcon, MapPinPlusIcon, SwitchCameraIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useCallback, useState } from "react";

import { tagLocationAction } from "@/app/(staff)/me/visits/actions";
import { FormError, FormField, SubmitButton, useActionToast } from "@/components/app/form-bits";
import { CameraCapture } from "@/components/staff/camera-capture";
import { GpsStatus } from "@/components/staff/gps-status";
import { useGeolocation } from "@/components/staff/use-geolocation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { initialActionState } from "@/lib/action";
import { cn } from "@/lib/utils";

/**
 * "Tag location" for field staff on the move: a live photo stamped with GPS
 * and time, an optional place name and note. Shows on the admin visit map.
 */
export function TagLocation({
  watermark,
  disabled,
  variant = "default",
  className,
}: {
  watermark: string;
  /** e.g. not checked in yet; the reason is shown under the button. */
  disabled?: string;
  variant?: "default" | "outline";
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const geo = useGeolocation({ enabled: open });
  const [state, formAction] = useActionState(tagLocationAction, initialActionState);

  const onSuccess = useCallback(() => {
    setOpen(false);
    setPhoto(null);
    router.refresh();
  }, [router]);
  useActionToast(state, onSuccess);

  const ready = Boolean(photo && geo.coords);

  return (
    <>
      <Button
        type="button"
        variant={variant}
        disabled={Boolean(disabled)}
        onClick={() => {
          setPhoto(null);
          setOpen(true);
        }}
        className={cn("h-12 w-full rounded-xl text-base font-semibold", className)}
      >
        <MapPinPlusIcon className="size-5" /> Tag location
      </Button>
      {disabled ? <p className="text-xs text-muted-foreground">{disabled}</p> : null}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
        >
          <SheetHeader className="pb-0">
            <SheetTitle className="flex items-center gap-2 text-lg font-semibold">
              <CameraIcon className="size-5" /> Tag your location
            </SheetTitle>
            <SheetDescription>
              Photograph where you are. The photo is stamped with your GPS position and the time, and appears on the visit map.
            </SheetDescription>
          </SheetHeader>

          {open ? (
            <form action={formAction} className="flex flex-col gap-3 px-4 pb-4">
              <CameraCapture
                key={facing}
                facingMode={facing}
                label={watermark}
                coords={geo.coords}
                value={photo}
                onChange={setPhoto}
                name="photo"
              />
              {!photo ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="self-center"
                  onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
                >
                  <SwitchCameraIcon /> {facing === "environment" ? "Use front camera" : "Use back camera"}
                </Button>
              ) : null}
              <GpsStatus geo={geo} />
              <input type="hidden" name="lat" value={geo.coords?.lat ?? ""} />
              <input type="hidden" name="lng" value={geo.coords?.lng ?? ""} />
              <input type="hidden" name="accuracy" value={geo.coords?.accuracy ?? ""} />

              <FormField label="Place" htmlFor="tag-place" error={state.fieldErrors?.placeLabel} hint="Optional, e.g. Okhla market, Bawana industrial area">
                <Input id="tag-place" name="placeLabel" maxLength={150} autoComplete="off" />
              </FormField>
              <FormField label="Note" htmlFor="tag-note" error={state.fieldErrors?.notes}>
                <Textarea id="tag-note" name="notes" rows={2} maxLength={1000} placeholder="Optional: what you're doing here" />
              </FormField>

              <FormError state={state} />
              <SubmitButton className="h-12 text-base font-semibold" disabled={!ready} pendingLabel="Saving…">
                Save location
              </SubmitButton>
              <p className="text-center text-xs text-muted-foreground">
                {!photo ? "Take a photo to continue." : !geo.coords ? "Waiting for your location…" : "Saved with the server time. It can't be edited afterwards."}
              </p>
            </form>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
