"use client";

import { useSyncExternalStore } from "react";

import { formatDuration } from "@/lib/time";

const TICK_MS = 15_000;

function subscribe(onChange: () => void) {
  const id = window.setInterval(onChange, TICK_MS);
  return () => window.clearInterval(id);
}

const clientNow = () => Math.floor(Date.now() / TICK_MS) * TICK_MS;

/** Live "time since check-in" (or between check-in and check-out once done). */
export function WorkedTicker({
  checkInAt,
  checkOutAt,
  serverNow,
}: {
  /** ISO timestamps from the server. */
  checkInAt: string;
  checkOutAt?: string | null;
  /** Server render time in ms, used for the first (hydration) render. */
  serverNow: number;
}) {
  const now = useSyncExternalStore(subscribe, clientNow, () => serverNow);
  const end = checkOutAt ? Date.parse(checkOutAt) : now;
  const minutes = Math.max(0, Math.floor((end - Date.parse(checkInAt)) / 60_000));
  return (
    <span className="tabular-nums" aria-live="off">
      {formatDuration(minutes)}
    </span>
  );
}
