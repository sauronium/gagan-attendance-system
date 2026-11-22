import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const tones = {
  default: "text-foreground",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
  brand: "text-primary",
  info: "text-info",
} as const;

/** KPI tile: big number + label, optionally linking to the detail screen. */
export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  icon,
  href,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: keyof typeof tones;
  icon?: ReactNode;
  href?: string;
}) {
  const body = (
    <div
      className={cn(
        "flex h-full flex-col gap-1 rounded-xl border bg-card p-4 text-card-foreground shadow-xs transition-colors",
        href && "transition-[transform,border-color,background-color] hover:-translate-y-0.5 hover:border-primary/40 hover:bg-accent/40",
      )}
    >
      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>{label}</span>
        {icon ? <span className="text-muted-foreground [&_svg]:size-4">{icon}</span> : null}
      </div>
      <div className={cn("text-2xl font-bold tracking-tight tabular-nums", tones[tone])}>
        {value}
      </div>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-ring">
      {body}
    </Link>
  ) : (
    body
  );
}
