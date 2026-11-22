// Date/time helpers. Points in time are JS Dates (UTC). Calendar days are
// "YYYY-MM-DD" strings in the business timezone (APP_TIMEZONE, default IST).
// Safe to import on client and server; callers pass the timezone.

const DEFAULT_TZ = "Asia/Kolkata";

function parts(date: Date, tz: string) {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Calendar day of `date` in `tz`, as YYYY-MM-DD. */
export function isoDateInTz(date: Date, tz: string): string {
  const p = parts(date, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** The UTC instant of local midnight at the start of `iso` in `tz`. */
export function zonedMidnight(iso: string, tz: string): Date {
  const guess = new Date(`${iso}T00:00:00Z`);
  const p = parts(guess, tz);
  const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - guess.getTime();
  return new Date(guess.getTime() - offset);
}

export function todayIso(tz: string): string {
  return isoDateInTz(new Date(), tz);
}

/** Minutes since local midnight in `tz` (0–1439). */
export function minutesOfDay(date: Date, tz: string): number {
  const p = parts(date, tz);
  return p.hour * 60 + p.minute;
}

/** "HH:MM[:SS]" → minutes since midnight. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function minutesToLabel(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m)} ${ampm}`;
}

/** 135 → "2h 15m" */
export function formatDuration(min: number): string {
  if (!min || min <= 0) return "0m";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

export function formatTime(date: Date | null | undefined, tz: string): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

/** "22 Nov 2026" from a Date or YYYY-MM-DD */
export function formatDate(
  value: Date | string | null | undefined,
  tz: string = DEFAULT_TZ,
): string {
  if (!value) return "—";
  const date =
    typeof value === "string" ? new Date(`${value}T00:00:00Z`) : value;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: typeof value === "string" ? "UTC" : tz,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(
  date: Date | null | undefined,
  tz: string,
): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: tz,
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

/** Weekday name for YYYY-MM-DD, e.g. "Sat". */
export function weekdayShort(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));
}

/** 0 = Sunday … 6 = Saturday */
export function weekdayIndex(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Whole days from a to b (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000,
  );
}

/** Every YYYY-MM-DD from `from` to `to` inclusive. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** "2026-11" → first and last day of that month. */
export function monthBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${pad(last)}` };
}

export function formatMonth(month: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
}
