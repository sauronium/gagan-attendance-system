import { type NextRequest, NextResponse } from "next/server";

import { cronAuthorised } from "@/lib/cron-auth";
import { processDueSms } from "@/lib/sms";

// Sends queued SMS whose scheduled time has come. Call it every 5–15 minutes
// so messages scheduled from Messages → Compose go out on time:
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/sms
// or /api/cron/sms?key=<secret>. Disabled (always 401) while CRON_SECRET is blank.
// Safe to overlap with the daily job: each message is claimed before sending.

export const dynamic = "force-dynamic";

async function handle(request: NextRequest) {
  if (!cronAuthorised(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const sent = await processDueSms();
    return NextResponse.json({ ok: true, sent });
  } catch (e) {
    console.error("cron: sms job crashed", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "SMS job failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
