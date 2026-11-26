import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { BellIcon, CameraIcon, MapPinIcon, TriangleAlertIcon } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ActionButton } from "@/components/app/action-dialog";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader, SectionTitle } from "@/components/app/page-header";
import { PhotoThumb } from "@/components/app/photo-thumb";
import { TagLocation } from "@/components/staff/tag-location";
import { badgeFrom, StatusBadge } from "@/components/app/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db";
import { fieldVisits, followUps } from "@/db/schema";
import { brand } from "@/lib/brand";
import { env } from "@/lib/env";
import { formatDistance } from "@/lib/geo";
import { labelOf, visitOutcome, visitPurpose, visitStatus } from "@/lib/labels";
import { formatPhone } from "@/lib/phone";
import { requireViewer } from "@/lib/session";
import { fileUrl } from "@/lib/storage";
import { addDays, formatDate, formatDateTime, formatTime, todayIso, zonedMidnight } from "@/lib/time";
import { clientOptions } from "@/server/lookups";
import { getOpenPunch } from "@/server/staff";

import { followUpDoneAction } from "./actions";
import { VisitForm } from "./visit-form";

export const metadata: Metadata = { title: "Visits" };

type VisitRow = Awaited<ReturnType<typeof loadVisits>>[number];

function loadVisits(employeeId: number, since: Date) {
  return db.query.fieldVisits.findMany({
    where: and(eq(fieldVisits.employeeId, employeeId), gte(fieldVisits.loggedAt, since)),
    orderBy: [desc(fieldVisits.loggedAt)],
    limit: 40,
    with: { client: { columns: { name: true } } },
  });
}

export default async function MyVisitsPage() {
  const viewer = await requireViewer();
  const me = viewer.employee;
  if (me.workType === "office" && me.role !== "technician") redirect("/me");

  const tz = env.timezone;
  const today = todayIso(tz);
  const startOfToday = zonedMidnight(today, tz);

  const [openPunch, clients, visits, dueFollowUps] = await Promise.all([
    getOpenPunch(me.id),
    clientOptions(),
    loadVisits(me.id, zonedMidnight(addDays(today, -14), tz)),
    db.query.followUps.findMany({
      where: and(eq(followUps.employeeId, me.id), eq(followUps.status, "open"), lte(followUps.dueOn, addDays(today, 3))),
      orderBy: [asc(followUps.dueOn)],
      limit: 30,
      with: {
        client: { columns: { name: true } },
        fieldVisit: { columns: { prospectName: true, purpose: true } },
      },
    }),
  ]);

  const todays = visits.filter((v) => v.loggedAt >= startOfToday);
  const recent = visits.filter((v) => v.loggedAt < startOfToday);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Visits" description="Log each client stop when you arrive, and tag places you pass through." />

      <section aria-label="Tag your location" className="flex flex-col gap-1.5">
        <TagLocation
          watermark={`${brand.company} · ${me.name}`}
          disabled={openPunch ? undefined : "Check in from the Home tab to tag locations."}
        />
      </section>

      {dueFollowUps.length ? (
        <section className="flex flex-col gap-2">
          <SectionTitle>Follow-ups due</SectionTitle>
          <ul className="flex flex-col gap-2">
            {dueFollowUps.map((f) => (
              <li key={f.id} className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-xs">
                <BellIcon className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {f.client?.name ?? f.fieldVisit.prospectName ?? "Prospect"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {f.dueOn < today ? (
                      <span className="text-destructive">Overdue · {formatDate(f.dueOn)}</span>
                    ) : f.dueOn === today ? (
                      "Due today"
                    ) : (
                      `Due ${formatDate(f.dueOn)}`
                    )}
                    {f.note ? ` · ${f.note}` : ""}
                  </p>
                </div>
                <ActionButton action={followUpDoneAction} hidden={{ id: f.id }} variant="outline" pendingLabel="Saving…">
                  Mark done
                </ActionButton>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPinIcon className="size-4" /> Log visit
          </CardTitle>
        </CardHeader>
        <CardContent>
          {openPunch ? (
            <VisitForm
              clientOptions={clients}
              purposeOptions={Object.entries(visitPurpose)
                .filter(([value]) => value !== "location_tag")
                .map(([value, label]) => ({ value, label }))}
              outcomeOptions={Object.entries(visitOutcome).map(([value, o]) => ({ value, label: o.label }))}
              today={today}
              watermark={`${brand.company} · ${me.name}`}
            />
          ) : (
            <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
              <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
              Visits can only be logged while you are checked in. Check in from the Home tab first.
            </p>
          )}
        </CardContent>
      </Card>

      <section className="flex flex-col gap-2">
        <SectionTitle>Today</SectionTitle>
        {todays.length ? (
          <VisitList visits={todays} tz={tz} showDate={false} />
        ) : (
          <EmptyState icon={<MapPinIcon />} title="Nothing logged today" description="Visits and location tags you save today appear here." />
        )}
      </section>

      {recent.length ? (
        <section className="flex flex-col gap-2">
          <SectionTitle>Last 14 days</SectionTitle>
          <VisitList visits={recent} tz={tz} showDate />
        </section>
      ) : null}
    </div>
  );
}

function VisitList({ visits, tz, showDate }: { visits: VisitRow[]; tz: string; showDate: boolean }) {
  return (
    <ul className="flex flex-col gap-2">
      {visits.map((v) => (
        <li key={v.id} className="rounded-xl border bg-card p-3 shadow-xs">
          <div className="flex items-start gap-3">
            <PhotoThumb src={fileUrl(v.photoKey)} alt="Site photo" size={44} />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="flex min-w-0 items-center gap-1.5 truncate text-sm font-medium">
                  {v.purpose === "location_tag" ? <CameraIcon className="size-3.5 shrink-0 text-info" aria-hidden /> : null}
                  <span className="truncate">
                    {v.purpose === "location_tag" ? (v.placeLabel ?? "Location tag") : (v.client?.name ?? v.prospectName ?? "Prospect")}
                  </span>
                </p>
                {badgeFrom(labelOf(visitStatus, v.status))}
              </div>
              <p className="text-xs text-muted-foreground">
                {showDate ? formatDateTime(v.loggedAt, tz) : formatTime(v.loggedAt, tz)} ·{" "}
                {visitPurpose[v.purpose] ?? v.purpose}
                {v.contactName ? ` · met ${v.contactName}` : ""}
                {v.contactPhone ? ` (${formatPhone(v.contactPhone)})` : ""}
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {v.outcome ? badgeFrom(labelOf(visitOutcome, v.outcome)) : null}
                {v.flags?.farFromSite ? (
                  <StatusBadge label={`${formatDistance(v.distanceFromSiteM)} from site`} tone="warning" />
                ) : null}
                {v.flags?.weakGps ? <StatusBadge label={`Weak GPS ±${v.accuracyM ?? "?"} m`} tone="warning" /> : null}
                {v.serviceVisitId ? <StatusBadge label="AMC service done" tone="success" /> : null}
              </div>
            </div>
          </div>
          {v.notes ? <p className="mt-2 line-clamp-3 text-sm text-foreground/90">{v.notes}</p> : null}
          {v.status === "rejected" && v.reviewRemark ? (
            <p className="mt-2 rounded-lg bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
              Rejected: {v.reviewRemark}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
