"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type GeoCoords = { lat: number; lng: number; accuracy: number };

type GeoStatus = "idle" | "acquiring" | "ready" | "error";

export type GeoState = {
  status: GeoStatus;
  coords: GeoCoords | null;
  error: string | null;
  retry: () => void;
};

function messageFor(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return "Location permission is blocked. Allow location for this site in your browser settings, then tap Retry.";
    case err.POSITION_UNAVAILABLE:
      return "Your location isn't available. Turn on GPS / location services and tap Retry.";
    case err.TIMEOUT:
      return "Couldn't get a GPS fix in time. Move near a window or outdoors and tap Retry.";
    default:
      return err.message || "Couldn't read your location.";
  }
}

/**
 * High-accuracy GPS fix with a timeout and automatic retries (timeouts and
 * unavailable fixes are retried; a permission denial is not). Call `retry()`
 * to take a fresh fix, e.g. when the accuracy is weak.
 */
export function useGeolocation({
  enabled = true,
  timeoutMs = 15_000,
  retries = 2,
}: { enabled?: boolean; timeoutMs?: number; retries?: number } = {}): GeoState {
  const [status, setStatus] = useState<GeoStatus>("idle");
  const [coords, setCoords] = useState<GeoCoords | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const runId = useRef(0);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  useEffect(() => {
    if (!enabled) return;
    const id = ++runId.current;
    let tries = 0;
    let cancelled = false;

    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      queueMicrotask(() => {
        if (cancelled) return;
        setStatus("error");
        setError("This device or browser can't share its location.");
      });
      return () => {
        cancelled = true;
      };
    }

    const request = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (cancelled || id !== runId.current) return;
          const next = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: Math.round(pos.coords.accuracy),
          };
          setCoords(next);
          setError(null);
          setStatus("ready");
        },
        (err) => {
          if (cancelled || id !== runId.current) return;
          if (err.code !== err.PERMISSION_DENIED && tries < retries) {
            tries += 1;
            request();
            return;
          }
          setError(messageFor(err));
          setStatus("error");
        },
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
      );
    };

    queueMicrotask(() => {
      if (cancelled) return;
      setStatus("acquiring");
      setError(null);
      request();
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, attempt, retries, timeoutMs]);

  return { status, coords, error, retry };
}
