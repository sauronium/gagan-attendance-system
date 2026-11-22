"use client";

import { CameraIcon, Loader2Icon, XIcon } from "lucide-react";
import { startTransition, useActionState, useCallback, useRef, useState } from "react";

import { FormError, FormField, useActionToast } from "@/components/app/form-bits";
import { CameraCapture } from "@/components/staff/camera-capture";
import { GpsStatus } from "@/components/staff/gps-status";
import { useGeolocation } from "@/components/staff/use-geolocation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { initialActionState } from "@/lib/action";
import { cn } from "@/lib/utils";

import { logVisitAction } from "./actions";

type Option = { value: string; label: string };

export function VisitForm({
  clientOptions,
  purposeOptions,
  outcomeOptions,
  today,
  watermark,
}: {
  clientOptions: Option[];
  purposeOptions: Option[];
  outcomeOptions: Option[];
  today: string;
  watermark: string;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [mode, setMode] = useState<"client" | "prospect">("client");
  const [photoOpen, setPhotoOpen] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [followUp, setFollowUp] = useState("");
  const geo = useGeolocation();
  const [state, action, pending] = useActionState(logVisitAction, initialActionState);

  const reset = useCallback(() => {
    ref.current?.reset();
    setPhoto(null);
    setPhotoOpen(false);
    setFollowUp("");
  }, []);
  useActionToast(state, reset);
  const fe = state.fieldErrors ?? {};

  return (
    <form
      ref={ref}
      // Submitted manually so a failed save keeps what was typed (form actions reset the form).
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => action(fd));
      }}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="mode" value={mode} />

      <div role="radiogroup" aria-label="Who did you visit?" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        {(
          [
            ["client", "Existing client"],
            ["prospect", "New prospect"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            onClick={() => setMode(value)}
            className={cn(
              "h-10 rounded-md text-sm font-medium transition-colors",
              mode === value ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "client" ? (
        <FormField label="Client" htmlFor="v-client" error={fe.clientId} required>
          <NativeSelect
            id="v-client"
            name="clientId"
            required
            placeholder="Choose a client"
            options={clientOptions}
            className="[&_select]:h-11"
          />
        </FormField>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Prospect name" htmlFor="v-pname" error={fe.prospectName} required>
            <Input id="v-pname" name="prospectName" required maxLength={150} className="h-11" />
          </FormField>
          <FormField label="Prospect phone" htmlFor="v-pphone" error={fe.prospectPhone}>
            <Input id="v-pphone" name="prospectPhone" type="tel" inputMode="tel" maxLength={20} className="h-11" />
          </FormField>
        </div>
      )}

      <FormField label="Purpose" htmlFor="v-purpose" error={fe.purpose} required>
        <NativeSelect
          id="v-purpose"
          name="purpose"
          required
          placeholder="Choose purpose"
          options={purposeOptions}
          className="[&_select]:h-11"
        />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Person met" htmlFor="v-cname" error={fe.contactName}>
          <Input id="v-cname" name="contactName" maxLength={120} className="h-11" />
        </FormField>
        <FormField label="Their phone" htmlFor="v-cphone" error={fe.contactPhone}>
          <Input id="v-cphone" name="contactPhone" type="tel" inputMode="tel" maxLength={20} className="h-11" />
        </FormField>
      </div>

      <FormField label="Notes" htmlFor="v-notes" error={fe.notes}>
        <Textarea id="v-notes" name="notes" rows={3} maxLength={2000} placeholder="What was discussed?" />
      </FormField>

      <FormField label="Outcome" htmlFor="v-outcome" error={fe.outcome}>
        <NativeSelect
          id="v-outcome"
          name="outcome"
          placeholder="No outcome yet"
          options={outcomeOptions}
          className="[&_select]:h-11"
        />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Follow-up date" htmlFor="v-fu" error={fe.followUpOn}>
          <Input
            id="v-fu"
            name="followUpOn"
            type="date"
            min={today}
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
            className="h-11"
          />
        </FormField>
        {followUp ? (
          <FormField label="Follow-up note" htmlFor="v-funote" error={fe.followUpNote}>
            <Input id="v-funote" name="followUpNote" maxLength={255} className="h-11" placeholder="Send quotation" />
          </FormField>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Site photo (optional)</span>
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
            <CameraIcon /> Add site photo
          </Button>
        )}
      </div>

      <GpsStatus geo={geo} />
      <input type="hidden" name="lat" value={geo.coords?.lat ?? ""} />
      <input type="hidden" name="lng" value={geo.coords?.lng ?? ""} />
      <input type="hidden" name="accuracy" value={geo.coords?.accuracy ?? ""} />

      <FormError state={state} />
      {fe.lat || fe.lng || fe.accuracy ? (
        <p className="text-xs text-destructive" role="alert">
          Location is required. Allow location access and tap Retry.
        </p>
      ) : null}
      <Button type="submit" className="h-11" disabled={pending || !geo.coords || (photoOpen && !photo)}>
        {pending ? <Loader2Icon className="animate-spin" /> : null}
        {pending ? "Saving…" : "Log visit"}
      </Button>
      {photoOpen && !photo ? (
        <p className="text-center text-xs text-muted-foreground">Take the photo or remove it to continue.</p>
      ) : null}
    </form>
  );
}
