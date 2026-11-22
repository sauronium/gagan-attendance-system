import Link from "next/link";
import type { ReactNode } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * GET form for list filters. Inputs inside it use `name` = search param.
 * Works without client JavaScript; "Clear" links back to the bare path.
 */
export function FilterBar({
  children,
  clearHref,
  className,
}: {
  children: ReactNode;
  clearHref?: string;
  className?: string;
}) {
  return (
    <form
      method="get"
      className={cn(
        "flex flex-col gap-2 rounded-xl border bg-card p-3 shadow-xs sm:flex-row sm:flex-wrap sm:items-end",
        className,
      )}
    >
      {children}
      <div className="flex gap-2 sm:ml-auto">
        <Button type="submit" size="lg">
          Apply filters
        </Button>
        {clearHref ? (
          <Link href={clearHref} className={buttonVariants({ variant: "ghost", size: "lg" })}>
            Clear filters
          </Link>
        ) : null}
      </div>
    </form>
  );
}

/** Label + control wrapper used inside FilterBar. */
export function FilterField({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label htmlFor={htmlFor} className={cn("flex min-w-36 flex-col gap-1 text-xs font-medium text-muted-foreground", className)}>
      {label}
      {children}
    </label>
  );
}
