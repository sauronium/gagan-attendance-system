import "server-only";

import { count, eq, notInArray } from "drizzle-orm";

import { db } from "@/db";
import { complaints, fieldVisits, leaveRequests } from "@/db/schema";
import type { NavBadges } from "@/components/app/app-sidebar";

/** Counts shown as badges in the admin sidebar. */
export async function getNavBadges(): Promise<NavBadges> {
  const [[leave], [visits], [open]] = await Promise.all([
    db.select({ n: count() }).from(leaveRequests).where(eq(leaveRequests.status, "pending")),
    db.select({ n: count() }).from(fieldVisits).where(eq(fieldVisits.status, "pending")),
    db
      .select({ n: count() })
      .from(complaints)
      .where(notInArray(complaints.status, ["resolved", "closed"])),
  ]);
  return { leave: leave.n, visits: visits.n, complaints: open.n };
}
