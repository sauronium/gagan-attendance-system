// Pure display helpers for the Clients / AMC / Complaints screens.
// Safe to import from server and client components.

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/** "12500.00" → "₹12,500" */
export function formatInr(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  return inr.format(Number.isFinite(n) ? n : 0);
}

export const planLabel: Record<string, string> = {
  comprehensive: "Comprehensive",
  non_comprehensive: "Labour only",
};

export const serviceTypeLabel: Record<string, string> = {
  amc: "AMC service",
  complaint: "Complaint",
  installation: "Installation",
  paid: "Paid call",
};

export const clientTypeLabel: Record<string, string> = {
  company: "Company",
  individual: "Individual",
};

/** "500 LPH · RO-500X" (falls back to plant type, then "Plant"). */
export function plantLabel(p: {
  capacityLph?: number | null;
  model?: string | null;
  plantType?: string | null;
}): string {
  const parts = [p.capacityLph ? `${p.capacityLph} LPH` : null, p.model || p.plantType || null].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Plant";
}

/** "Sector 18, Noida" */
export function siteArea(s: { area?: string | null; city?: string | null } | null | undefined): string {
  if (!s) return "";
  return [s.area, s.city].filter(Boolean).join(", ");
}

/** Full one-line address for SMS and detail views. */
export function siteAddress(s: {
  addressLine: string;
  area?: string | null;
  city?: string | null;
  pincode?: string | null;
}): string {
  return [s.addressLine, s.area, s.city, s.pincode].filter(Boolean).join(", ");
}

/** Contract end for a one-year term: start + 1 year − 1 day. */
export function oneYearEnd(start: string): string {
  const [y, m, d] = start.split("-").map(Number);
  const end = new Date(Date.UTC(y + 1, m - 1, d));
  end.setUTCDate(end.getUTCDate() - 1);
  return end.toISOString().slice(0, 10);
}

/** Short age like "3d", "5h", "12m" from a past instant. */
export function ageLabel(from: Date, now: Date = new Date()): string {
  const min = Math.max(0, Math.floor((now.getTime() - from.getTime()) / 60_000));
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
