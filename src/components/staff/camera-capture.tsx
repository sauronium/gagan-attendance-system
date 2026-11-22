"use client";

import { CameraIcon, CameraOffIcon, Loader2Icon, RefreshCwIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { GeoCoords } from "./use-geolocation";

// Live camera capture for check-in selfies and site photos.
// - Only a live getUserMedia stream is used; there is deliberately no
//   gallery / file-input fallback, so old photos can't be uploaded.
// - The captured frame is downscaled (max 720 px) and a watermark banner is
//   burned in: device time (the server records the authoritative time),
//   coordinates ± accuracy and a label.
// - Output is a WebP data URL (JPEG on browsers that can't encode WebP).

const MAX_SIDE = 720;
const QUALITY = 0.7;

type Phase = "starting" | "live" | "captured" | "error";

function cameraError(e: unknown): string {
  const name = e instanceof DOMException ? e.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Camera permission is blocked. Allow camera access for this site in your browser settings, then tap Try again.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No camera was found on this device.";
    case "NotReadableError":
    case "AbortError":
      return "The camera is being used by another app. Close it and tap Try again.";
    default:
      return "Couldn't start the camera. Tap Try again.";
  }
}

const pad = (n: number) => String(n).padStart(2, "0");

function deviceTimeLabel(d: Date) {
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}:${pad(d.getSeconds())} (device time)`;
}

function coordsLabel(c: GeoCoords | null | undefined) {
  if (!c) return "Location unavailable";
  const lat = `${Math.abs(c.lat).toFixed(5)}°${c.lat >= 0 ? "N" : "S"}`;
  const lng = `${Math.abs(c.lng).toFixed(5)}°${c.lng >= 0 ? "E" : "W"}`;
  return `${lat} ${lng} · ±${Math.round(c.accuracy)} m`;
}

function renderFrame(video: HTMLVideoElement, coords: GeoCoords | null | undefined, label: string) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) throw new Error("Camera isn't ready yet.");
  const scale = Math.min(1, MAX_SIDE / Math.max(vw, vh));
  const w = Math.round(vw * scale);
  const h = Math.round(vh * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't process the photo.");
  ctx.drawImage(video, 0, 0, w, h);

  // Watermark banner along the bottom edge.
  const lines = [deviceTimeLabel(new Date()), coordsLabel(coords), label];
  const fontSize = Math.max(12, Math.round(w / 34));
  const lineH = Math.round(fontSize * 1.35);
  const padY = Math.round(fontSize * 0.6);
  const bannerH = lines.length * lineH + padY * 2;
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(0, h - bannerH, w, bannerH);
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "top";
  ctx.font = `600 ${fontSize}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  lines.forEach((line, i) => {
    ctx.fillText(line, Math.round(fontSize * 0.7), h - bannerH + padY + i * lineH, w - fontSize * 1.4);
  });

  let url = canvas.toDataURL("image/webp", QUALITY);
  if (!url.startsWith("data:image/webp")) url = canvas.toDataURL("image/jpeg", QUALITY);
  return url;
}

export function CameraCapture({
  facingMode,
  label,
  coords,
  value,
  onChange,
  name,
  className,
}: {
  /** "user" = front camera (selfies), "environment" = back camera (site photos). */
  facingMode: "user" | "environment";
  /** Last watermark line, e.g. "Agam Water · Check-in". */
  label: string;
  /** Latest GPS fix, burned into the watermark at capture time. */
  coords?: GeoCoords | null;
  /** Captured data URL (controlled). Null shows the live preview. */
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  /** When set, a hidden input with this name carries the data URL in forms. */
  name?: string;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>("starting");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Start the camera whenever there's no captured photo; stop it otherwise
  // and on unmount.
  useEffect(() => {
    if (value) {
      stop();
      return;
    }
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setPhase("starting");
        setError(null);
      }
    });

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error(
            window.isSecureContext
              ? "This browser can't open the camera. Try Chrome or Safari."
              : "The camera needs a secure (https) connection.",
          );
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }
        setPhase("live");
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof DOMException || !(e instanceof Error) ? cameraError(e) : e.message);
        setPhase("error");
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
  }, [value, facingMode, attempt, stop]);

  const capture = () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      onChange(renderFrame(video, coords, label));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't take the photo.");
    }
  };

  const retake = () => {
    onChange(null);
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {name ? <input type="hidden" name={name} value={value ?? ""} /> : null}
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-muted">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="Captured photo with watermark" className="size-full object-cover" />
        ) : (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              aria-label="Live camera preview"
              className={cn(
                "size-full object-cover",
                facingMode === "user" && "-scale-x-100",
                phase !== "live" && "invisible",
              )}
            />
            {phase === "starting" ? (
              <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
                <span className="flex items-center gap-2">
                  <Loader2Icon className="size-4 animate-spin" /> Starting camera…
                </span>
              </div>
            ) : null}
            {phase === "error" ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
                <CameraOffIcon className="size-8 text-muted-foreground" aria-hidden />
                <p className="text-sm text-foreground" role="alert">
                  {error}
                </p>
                <Button type="button" variant="outline" onClick={() => setAttempt((a) => a + 1)}>
                  <RefreshCwIcon /> Try again
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
      {phase === "live" && error && !value ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {value ? (
        <Button type="button" variant="outline" className="h-11" onClick={retake}>
          <RefreshCwIcon /> Retake
        </Button>
      ) : (
        <Button type="button" variant="secondary" className="h-11" onClick={capture} disabled={phase !== "live"}>
          <CameraIcon /> Take photo
        </Button>
      )}
    </div>
  );
}
