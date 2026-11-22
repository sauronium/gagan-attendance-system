import Image from "next/image";

import { brand } from "@/lib/brand";
import { cn } from "@/lib/utils";

type LogoProps = {
  /** "full" = drop mark + "AGAM WATER INDUSTRIES"; "mark" = square drop only. */
  variant?: "full" | "mark";
  /** Rendered height in pixels; width follows the logo's aspect ratio. */
  height?: number;
  className?: string;
  priority?: boolean;
};

/**
 * Agam Water Industries logo. The artwork is designed for light backgrounds,
 * so in dark mode it sits on a white chip to keep the navy and orange legible.
 */
export function Logo({
  variant = "full",
  height = 40,
  className,
  priority = false,
}: LogoProps) {
  const art = brand.logo[variant];
  const width = Math.round((art.width / art.height) * height);

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-brand dark:bg-white dark:px-2 dark:py-1",
        className,
      )}
    >
      <Image
        src={art.src}
        alt={brand.company}
        width={width}
        height={height}
        priority={priority}
        style={{ width, height }}
      />
    </span>
  );
}
