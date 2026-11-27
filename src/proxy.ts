import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

import { isLocalHost, isScannerPath, isUnwantedBot } from "@/lib/bots";

// Runs before every page and API route except static assets and the cron
// endpoints (see `matcher`).
//
// 1. Bot filter: crawlers, scrapers, link previewers and vulnerability
//    scanners get a bare 403/404 before any rendering or database work.
//    robots.txt stays readable so well-behaved crawlers learn to stay away.
// 2. Fast, optimistic login gate: without a session cookie, private pages
//    redirect to /login. This does NOT validate the session; every page and
//    server action still checks it through requireViewer() / requireRole()
//    in src/lib/session.ts.

/** Pages reachable without signing in. */
const PUBLIC_PATHS = [/^\/login(?:\/|$)/, /^\/api\/auth(?:\/|$)/, /^\/manifest\.webmanifest$/];

const NO_INDEX = "noindex, nofollow, noarchive, nosnippet, noimageindex";

function refuse(status: 403 | 404) {
  return new NextResponse(status === 404 ? "Not found" : "Forbidden", {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "x-robots-tag": NO_INDEX, "cache-control": "no-store" },
  });
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname === "/robots.txt") return NextResponse.next();

  if (!isLocalHost(request.headers.get("host"), request.headers.get("x-forwarded-host"))) {
    if (isScannerPath(pathname)) return refuse(404);
    if (isUnwantedBot(request.headers.get("user-agent"))) return refuse(403);
  }

  if (PUBLIC_PATHS.some((p) => p.test(pathname))) return NextResponse.next();

  if (!getSessionCookie(request)) {
    const url = new URL("/login", request.url);
    const next = pathname + search;
    if (next !== "/") url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Everything except build assets, icons and the cron endpoints (called by
  // the scheduler with a secret; they must never be filtered).
  matcher: ["/((?!api/cron|_next/static|_next/image|brand|icon.png|apple-icon.png|favicon.ico).*)"],
};
