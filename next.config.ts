import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components is off on purpose: every screen in this app is behind a
  // login and shows per-user, live data, so pages render on each request.
  // Turning it on would require a <Suspense> boundary around every cookie,
  // session and database read.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Privacy and safety headers. Camera and location are allowed for this
  // site only (check-in selfies, visit photos, location tags); powerful
  // features the app never uses are switched off.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Permissions-Policy",
            value: "camera=(self), geolocation=(self), microphone=(), payment=(), usb=(), serial=(), bluetooth=(), browsing-topics=()",
          },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
  experimental: {
    serverActions: {
      // Check-in and visit photos are sent to server actions as data URLs
      // (downscaled to ~720 px, normally well under 1 MB). Allow headroom while
      // staying below Vercel's 4.5 MB request limit.
      bodySizeLimit: "3mb",
    },
  },
  images: {
    // Check-in and visit photos are served by our own /api/files route.
    localPatterns: [{ pathname: "/brand/**" }, { pathname: "/api/files/**" }],
  },
};

export default nextConfig;
