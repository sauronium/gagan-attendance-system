import type { MetadataRoute } from "next";

// Private staff app: no crawler of any kind may index or fetch it. Bots that
// ignore this are also refused by src/proxy.ts; this file stays reachable so
// well-behaved crawlers can read the rule and stop asking.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
