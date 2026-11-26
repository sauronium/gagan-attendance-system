import { type NextRequest, NextResponse } from "next/server";

import { cronAuthorised } from "@/lib/cron-auth";
import { runDailyJobs } from "@/server/cron";

// Daily job endpoint, called by Hostinger cron (or any scheduler) around
// 9:00 AM local time:
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/daily
// or, for schedulers that can't set headers: /api/cron/daily?key=<secret>.
// Disabled (always 401) while CRON_SECRET is blank.

export const dynamic = "force-dynamic";

async function handle(request: NextRequest) {
  if (!cronAuthorised(request)) {
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
