import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * Tabs driven by the URL (?tab=…), so each tab is a server-rendered view
 * that can be linked to and refreshed.
 */
export function LinkTabs({
  tabs,
  active,
  className,
}: {
  tabs: { key: string; label: string; href: string; count?: number }[];
  active: string;
  className?: string;
}) {
  return (
    <nav
      aria-label="Sections"
      className={cn(
        "-mx-1 flex max-w-full gap-1 overflow-x-auto border-b px-1",
        className,
      )}
    >
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.count != null && t.count > 0 ? (
              <span className="rounded-full bg-secondary px-1.5 text-xs text-secondary-foreground tabular-nums">
                {t.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
