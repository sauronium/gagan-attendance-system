import "server-only";

import { and, asc, eq, gte, lt, type SQL } from "drizzle-orm";

import { db } from "@/db";
import {
  fieldVisits,
  officeLocations,
  type VisitPurpose,
  type VisitStatus,
  visitPurposes,
  visitStatuses,
} from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { distanceM } from "@/lib/geo";
import { addDays, zonedMidnight } from "@/lib/time";

// Field visit queries and the verify / reject review step used by the
// admin Visits screen.

export type VisitFilters = {
  /** Single local day (YYYY-MM-DD); null = the last `recentDays` days. */
  date: string | null;
  today: string;
  employeeId?: number;
  status?: VisitStatus;
  purpose?: VisitPurpose;
};

/** Window used when no single day is picked (e.g. the pending queue). */
export const RECENT_VISIT_DAYS = 30;

export const isVisitStatus = (v: string | undefined): v is VisitStatus =>
  !!v && (visitStatuses as readonly string[]).includes(v);
export const isVisitPurpose = (v: string | undefined): v is VisitPurpose =>
  !!v && (visitPurposes as readonly string[]).includes(v);

/** Visits matching the filters, oldest first (so the route reads in time order). */
export async function getVisits(f: VisitFilters, tz: string) {
  const from = f.date ?? addDays(f.today, -(RECENT_VISIT_DAYS - 1));
  const to = addDays(f.date ?? f.today, 1);
  const where: SQL[] = [
    gte(fieldVisits.loggedAt, zonedMidnight(from, tz)),
    lt(fieldVisits.loggedAt, zonedMidnight(to, tz)),
  ];
  if (f.employeeId) where.push(eq(fieldVisits.employeeId, f.employeeId));
  if (f.status) where.push(eq(fieldVisits.status, f.status));
  if (f.purpose) where.push(eq(fieldVisits.purpose, f.purpose));

  return db.query.fieldVisits.findMany({
    where: and(...where),
    orderBy: [asc(fieldVisits.loggedAt)],
    limit: 500,
    with: {
      employee: { columns: { id: true, name: true, empCode: true } },
      client: { columns: { id: true, name: true } },
      site: { columns: { label: true, area: true, city: true } },
      reviewer: { columns: { name: true } },
    },
  });
}

export type VisitRow = Awaited<ReturnType<typeof getVisits>>[number];

/** Straight-line distance along consecutive points, in metres. */
export function routeDistanceM(points: { lat: number; lng: number }[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    total += distanceM(a.lat, a.lng, b.lat, b.lng);
  }
  return total;
}

/** Map centre when there are no visits: first active office, else null. */
export async function defaultMapCenter(): Promise<[number, number] | null> {
  const office = await db.query.officeLocations.findFirst({
    where: eq(officeLocations.isActive, true),
    orderBy: [asc(officeLocations.id)],
    columns: { lat: true, lng: true },
  });
  return office ? [Number(office.lat), Number(office.lng)] : null;
}

async function setReview(
  id: number,
  reviewerId: number,
  status: Exclude<VisitStatus, "pending">,
  remark: string | null,
) {
  const visit = await db.query.fieldVisits.findFirst({
    where: eq(fieldVisits.id, id),
    columns: { id: true, status: true, reviewRemark: true },
  });
  if (!visit) throw new Error("Visit not found.");
  if (visit.status === status) throw new Error(`This visit is already ${status}.`);

  await db
    .update(fieldVisits)
    .set({ status, reviewedBy: reviewerId, reviewedAt: new Date(), reviewRemark: remark })
    .where(eq(fieldVisits.id, id));
  await logAudit({
    actorId: reviewerId,
    tableName: "field_visits",
    recordId: id,
    action: "update",
    before: { status: visit.status, reviewRemark: visit.reviewRemark },
    after: { status, reviewRemark: remark },
    reason: remark,
  });
}

export const verifyVisit = (id: number, reviewerId: number) =>
  setReview(id, reviewerId, "verified", null);

export const rejectVisit = (id: number, reviewerId: number, remark: string) =>
  setReview(id, reviewerId, "rejected", remark);
