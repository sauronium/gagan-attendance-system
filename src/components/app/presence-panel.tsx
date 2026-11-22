import Link from "next/link";

import { cn } from "@/lib/utils";

type Segment = {
  key: string;
  label: string;
  value: number;
  href: string;
  /** Classes for the bar segment and its legend swatch. */
  fill: string;
};

/**
 * The dashboard's opening element: how many people are at work today, as one
 * sentence and one segmented bar (filled with the brand's water gradient for
 * the share that is at work). Every segment links to the filtered register.
 */
export function PresencePanel({
  counts,
  active,
}: {
  counts: { present: number; halfDay: number; late: number; onLeave: number; off: number; notCheckedIn: number; absent: number };
  active: number;
}) {
  const atWork = counts.present + counts.halfDay + counts.late;
  const expected = Math.max(0, active - counts.off - counts.onLeave);

  const segments: Segment[] = [
    { key: "present", label: "On time", value: counts.present + counts.halfDay, href: "/attendance?status=present", fill: "bg-brand-gradient" },
    { key: "late", label: "Late", value: counts.late, href: "/attendance?status=late", fill: "bg-brand-orange" },
    { key: "leave", label: "On leave", value: counts.onLeave, href: "/attendance?status=on_leave", fill: "bg-brand-aqua" },
    { key: "missing", label: "Not checked in", value: counts.notCheckedIn + counts.absent, href: "/attendance?status=not_checked_in", fill: "bg-destructive/70" },
    { key: "off", label: "Week off / holiday", value: counts.off, href: "/attendance", fill: "bg-muted-foreground/25" },
  ];
  const total = Math.max(1, segments.reduce((n, s) => n + s.value, 0));

  const sentence =
    expected === 0
      ? counts.off
        ? "It's a day off for everyone scheduled."
        : "No one is expected at work today."
      : atWork === expected
        ? "Everyone expected is at work."
        : `${expected - atWork} still to check in.`;

  return (
    <section aria-labelledby="presence-heading" className="rounded-2xl border bg-card p-5 shadow-xs sm:p-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <h2 id="presence-heading" className="flex items-baseline gap-3">
          <span className="text-5xl leading-none font-bold tracking-tight text-primary tabular-nums sm:text-6xl">{atWork}</span>
          <span className="text-lg text-foreground">
            at work today
            <span className="text-muted-foreground"> of {expected} expected</span>
          </span>
        </h2>
        <p className="text-sm text-muted-foreground">{sentence}</p>
      </div>

      <div
        className="mt-5 flex h-4 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={segments.map((s) => `${s.value} ${s.label.toLowerCase()}`).join(", ")}
      >
        {segments.map((s) =>
          s.value ? (
            <Link
              key={s.key}
              href={s.href}
              title={`${s.value} ${s.label.toLowerCase()}`}
              className={cn("h-full transition-[filter] first:rounded-l-full last:rounded-r-full hover:brightness-110", s.fill)}
              style={{ width: `${(s.value / total) * 100}%` }}
            />
          ) : null,
        )}
      </div>

      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {segments.map((s) => (
          <li key={s.key}>
            <Link href={s.href} className="inline-flex items-center gap-2 rounded-md hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">
              <span aria-hidden className={cn("size-2.5 rounded-full", s.fill)} />
              <span className="font-semibold tabular-nums">{s.value}</span>
              <span className="text-muted-foreground">{s.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
