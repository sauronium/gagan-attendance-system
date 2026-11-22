import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

// Fast, optimistic gate: if there is no session cookie at all, send the
// visitor to /login before rendering anything. This does NOT validate the
// session. Every page and server action still checks it properly through
// requireViewer() / requireRole() in src/lib/session.ts.
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    const url = new URL("/login", request.url);
    const next = request.nextUrl.pathname + request.nextUrl.search;
    if (next !== "/") url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Everything except login, auth API, cron, static assets and icons.
  matcher: [
    "/((?!login|api/auth|api/cron|_next/static|_next/image|brand|icon.png|apple-icon.png|manifest.webmanifest|favicon.ico).*)",
  ],
};
