"use client";

import { CameraIcon, LogInIcon, LogOutIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useCallback, useState } from "react";

import { FormError, SubmitButton, useActionToast, useToastedAction } from "@/components/app/form-bits";
import { CameraCapture } from "@/components/staff/camera-capture";
import { getDeviceId } from "@/components/staff/device-id";
import { GpsStatus } from "@/components/staff/gps-status";
import { useGeolocation } from "@/components/staff/use-geolocation";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { initialActionState } from "@/lib/action";
import { cn } from "@/lib/utils";

import { checkInAction, checkOutAction } from "./actions";

/** Check-in / check-out button that opens the selfie + GPS bottom sheet. */
export function PunchFlow({ mode, watermark }: { mode: "in" | "out"; watermark: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState("");
  const geo = useGeolocation({ enabled: open });
  const [state, formAction] = useActionState(useToastedAction(mode === "in" ? checkInAction : checkOutAction), initialActionState);

  const onSuccess = useCallback(() => {
    setOpen(false);
    setPhoto(null);
    router.refresh();
  }, [router]);
  useActionToast(state, onSuccess, { silent: true });

  const openSheet = () => {
    setDeviceId(getDeviceId());
    setPhoto(null);
    setOpen(true);
  };

  const isIn = mode === "in";
  const ready = Boolean(photo && geo.coords);
  const fieldErrors = state.fieldErrors ? Object.values(state.fieldErrors) : [];

  return (
    <>
      <Button
        type="button"
        onClick={openSheet}
        className={cn(
          "h-14 w-full rounded-xl text-base font-semibold shadow-sm",
          isIn ? "bg-brand-gradient text-white hover:opacity-90" : "",
        )}
        variant={isIn ? "default" : "outline"}
      >
        {isIn ? <LogInIcon className="size-5" /> : <LogOutIcon className="size-5" />}
        {isIn ? "Check in" : "Check out"}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
        >
          <SheetHeader className="pb-0">
            <SheetTitle className="flex items-center gap-2 text-lg font-semibold">
              <CameraIcon className="size-5" /> {isIn ? "Check in" : "Check out"}
            </SheetTitle>
            <SheetDescription>
              Take a live selfie. Your location and the server time are recorded with it.
            </SheetDescription>
          </SheetHeader>

          {open ? (
            <form action={formAction} className="flex flex-col gap-3 px-4 pb-4">
              <CameraCapture
                facingMode="user"
                label={watermark}
                coords={geo.coords}
                value={photo}
                onChange={setPhoto}
                name="photo"
              />
              <GpsStatus geo={geo} />
              <input type="hidden" name="lat" value={geo.coords?.lat ?? ""} />
              <input type="hidden" name="lng" value={geo.coords?.lng ?? ""} />
              <input type="hidden" name="accuracy" value={geo.coords?.accuracy ?? ""} />
              {isIn ? <input type="hidden" name="deviceId" value={deviceId} /> : null}
              <FormError state={state} />
              {fieldErrors.length ? (
                <ul className="text-xs text-destructive" role="alert">
                  {fieldErrors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              ) : null}
              <SubmitButton
                className={cn("h-12 text-base font-semibold", isIn && "bg-brand-gradient text-white hover:opacity-90")}
                disabled={!ready}
                pendingLabel="Saving…"
              >
                {isIn ? "Confirm check-in" : "Confirm check-out"}
              </SubmitButton>
              <p className="text-center text-xs text-muted-foreground">
                {!photo
                  ? "Take a photo to continue."
                  : !geo.coords
                    ? "Waiting for your location…"
                    : "The photo is stamped and uploaded. It can't be edited afterwards."}
              </p>
            </form>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
