import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/labels";

const toneClass: Record<Tone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-destructive/10 text-destructive",
  info: "bg-info-soft text-info",
  brand: "bg-secondary text-secondary-foreground",
  highlight: "bg-highlight/10 text-highlight",
  neutral: "bg-muted text-muted-foreground",
};

/** Small coloured pill for statuses. Pass a label + tone from lib/labels. */
export function StatusBadge({
  label,
  tone = "neutral",
  className,
}: {
  label: string;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-full px-2 text-xs font-medium whitespace-nowrap",
        toneClass[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}

export function badgeFrom(
  item: { label: string; tone: Tone },
  className?: string,
) {
  return <StatusBadge label={item.label} tone={item.tone} className={className} />;
}
