import type { MetadataRoute } from "next";

import { brand } from "@/lib/brand";

// PWA manifest: lets staff install the app on their phone home screen
// with Agam's name, icon and colors.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: brand.appName,
    short_name: brand.shortName,
    description: `${brand.tagline} for ${brand.company}.`,
    start_url: "/",
    display: "standalone",
    background_color: brand.colors.surface,
    theme_color: brand.colors.navy,
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
