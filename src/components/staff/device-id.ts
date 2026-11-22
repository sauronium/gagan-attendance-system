"use client";

const KEY = "agam.deviceId";

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * A stable id for this phone/browser, generated once and kept in
 * localStorage. Sent with every check-in so the server can flag a new device.
 * Call from event handlers or effects only (not during render).
 */
export function getDeviceId(): string {
  try {
    const existing = window.localStorage.getItem(KEY);
    if (existing) return existing;
    const id = randomId();
    window.localStorage.setItem(KEY, id);
    return id;
  } catch {
    // Private mode / storage blocked: the server will treat it as a new device.
    return "";
  }
}
