import { ImageIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Thumbnail for a stored photo (check-in selfie, visit photo). Opens the
 * full image in a new tab. Uses <img> because files come from our
 * authenticated /api/files route.
 */
export function PhotoThumb({
  src,
  alt,
  size = 40,
  className,
}: {
  src: string | null | undefined;
  alt: string;
  size?: number;
  className?: string;
}) {
  if (!src) {
    return (
      <span
        className={cn("inline-grid shrink-0 place-items-center rounded-md bg-muted text-muted-foreground", className)}
        style={{ width: size, height: size }}
        aria-label="No photo"
      >
        <ImageIcon className="size-4" />
      </span>
    );
  }
  return (
    <a href={src} target="_blank" rel="noreferrer" className={cn("inline-block shrink-0", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        width={size}
        height={size}
        loading="lazy"
        className="rounded-md border object-cover"
        style={{ width: size, height: size }}
      />
    </a>
  );
}
