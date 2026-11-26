"use client";

import { Loader2Icon, MapPinIcon, MapPinOffIcon, RefreshCwIcon, TriangleAlertIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { WEAK_GPS_M } from "@/lib/geo";
import { cn } from "@/lib/utils";

import type { GeoState } from "./use-geolocation";

/** One-line GPS status: acquiring… / ready ±12 m / weak ±150 m / error, with Retry. */
export function GpsStatus({ geo, className }: { geo: GeoState; className?: string }) {
  const weak = geo.coords != null && geo.coords.accuracy > WEAK_GPS_M;
  let icon = <Loader2Icon className="size-4 animate-spin" />;
  let text = "Getting your location…";
  let tone = "bg-muted text-muted-foreground";

  if (geo.status === "error") {
    icon = <MapPinOffIcon className="size-4" />;
    text = geo.error ?? "Couldn't read your location.";
    tone = "bg-destructive/10 text-destructive";
  } else if (geo.status === "ready" && geo.coords) {
    if (weak) {
      icon = <TriangleAlertIcon className="size-4" />;
      text = `Weak GPS · ±${geo.coords.accuracy} m. Retry for a better fix, or continue and it will be flagged for review.`;
      tone = "bg-warning-soft text-warning";
    } else {
      icon = <MapPinIcon className="size-4" />;
      text = `Location ready · accuracy ±${geo.coords.accuracy} m`;
      tone = "bg-success-soft text-success";
    }
  }

  const canRetry = geo.status === "error" || weak;

  return (
    <div
      className={cn("flex items-start gap-2 rounded-lg px-3 py-2 text-sm", tone, className)}
      role="status"
      aria-live="polite"
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">{text}</span>
      {canRetry ? (
        <Button type="button" size="sm" variant="outline" onClick={geo.retry} className="shrink-0">
          <RefreshCwIcon /> Retry
        </Button>
      ) : null}
    </div>
  );
}
