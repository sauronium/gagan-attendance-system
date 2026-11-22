import { ChevronDownIcon } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * Styled native <select>. Used for forms and filter bars because it posts
 * with FormData and works in plain GET forms without client JavaScript.
 */
export function NativeSelect({
  className,
  options,
  placeholder,
  children,
  ...props
}: ComponentProps<"select"> & {
  options?: { value: string; label: string }[];
  /** Adds an empty first option (e.g. "All departments"). */
  placeholder?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <select
        data-slot="native-select"
        className="h-9 w-full min-w-0 appearance-none rounded-lg border border-input bg-background py-1 pr-8 pl-2.5 text-sm text-foreground shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive dark:bg-input/30"
        {...props}
      >
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {children}
      </select>
      <ChevronDownIcon
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}
