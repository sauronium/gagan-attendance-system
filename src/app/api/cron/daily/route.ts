import { timingSafeEqual } from "node:crypto";

import { type NextRequest, NextResponse } from "next/server";

import { env } from "@/lib/env";
import { runDailyJobs } from "@/server/cron";

// Daily job endpoint, called by Hostinger cron (or any scheduler) around
// 9:00 AM local time:
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/daily
// or, for schedulers that can't set headers: /api/cron/daily?key=<secret>.
// Disabled (always 401) while CRON_SECRET is blank.

export const dynamic = "force-dynamic";

/** Constant-time string compare, so the secret can't be guessed by timing. */
function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function authorised(request: NextRequest): boolean {
  const secret = env.cronSecret;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const key = request.nextUrl.searchParams.get("key") ?? "";
  return (bearer !== "" && safeEqual(bearer, secret)) || (key !== "" && safeEqual(key, secret));
}

async function handle(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await runDailyJobs();
    return NextResponse.json(summary, { status: summary.ok ? 200 : 500 });
  } catch (e) {
    console.error("cron: daily job crashed", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Daily job failed" },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
