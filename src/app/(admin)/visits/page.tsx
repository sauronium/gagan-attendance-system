import {
  CameraIcon,
  CheckCircle2Icon,
  ClockIcon,
  MapPinOffIcon,
  MapPinnedIcon,
  RouteIcon,
  SatelliteDishIcon,
  XCircleIcon,
} from "lucide-react";
import type { Metadata } from "next";

import { ActionButton, ActionDialog } from "@/components/app/action-dialog";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar, FilterField } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { PhotoThumb } from "@/components/app/photo-thumb";
import { StatCard } from "@/components/app/stat-card";
import { badgeFrom, StatusBadge } from "@/components/app/status-badge";
import { VisitMapLoader, type VisitMapPoint } from "@/components/visits/visit-map-loader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { env } from "@/lib/env";
import { formatDistance } from "@/lib/geo";
import { labelOf, visitOutcome, visitPurpose, visitStatus } from "@/lib/labels";
import { formatPhone } from "@/lib/phone";
import { requireAdmin } from "@/lib/session";
import { fileUrl } from "@/lib/storage";
import { formatDate, formatDateTime, formatTime, todayIso } from "@/lib/time";
import { employeeOptions } from "@/server/lookups";
import {
  defaultMapCenter,
  getVisits,
  isVisitPurpose,
  isVisitStatus,
  RECENT_VISIT_DAYS,
  routeDistanceM,
  type VisitRow,
} from "@/server/visits";

import { rejectVisitAction, verifyVisitAction } from "./actions";

export const metadata: Metadata = { title: "Field visits" };

type SearchParams = Promise<{
  date?: string;
  employee?: string;
  status?: string;
  purpose?: string;
}>;

export default async function VisitsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const tz = env.timezone;
  const today = todayIso(tz);

  const status = isVisitStatus(sp.status) ? sp.status : undefined;
  const purpose = isVisitPurpose(sp.purpose) ? sp.purpose : undefined;
  const employeeId = Number(sp.employee) || undefined;
  // No date param: today, except the pending queue (?status=pending from the
  // dashboard), which should show everything still waiting. An empty date
  // submitted from the filter bar also means "recent days".
  const date =
    sp.date === undefined
      ? status === "pending"
        ? null
        : today
      : /^\d{4}-\d{2}-\d{2}$/.test(sp.date)
        ? sp.date
        : null;

  const [visits, empOpts, center] = await Promise.all([
    getVisits({ date, today, employeeId, status, purpose }, tz),
    employeeOptions(),
    defaultMapCenter(),
  ]);

  // A day's route only makes sense for one person on one day.
  const showRoute = Boolean(employeeId && date);
  const points: VisitMapPoint[] = visits.map((v, i) => ({
    id: v.id,
    lat: Number(v.lat),
    lng: Number(v.lng),
    status: v.status,
    title: visitTitle(v),
    employee: v.employee.name,
    time: date ? formatTime(v.loggedAt, tz) : formatDateTime(v.loggedAt, tz),
    purpose: visitPurpose[v.purpose] ?? v.purpose,
    order: showRoute ? i + 1 : undefined,
    isTag: v.purpose === "location_tag",
    photoUrl: fileUrl(v.photoKey),
  }));

  const counts = {
    pending: visits.filter((v) => v.status === "pending").length,
    verified: visits.filter((v) => v.status === "verified").length,
    rejected: visits.filter((v) => v.status === "rejected").length,
  };
  const distance = showRoute ? routeDistanceM(points) : null;
  const rangeLabel = date ? formatDate(date) : `Last ${RECENT_VISIT_DAYS} days`;

  // Pending first in the list (it's a review queue), newest first within each status.
  const order = { pending: 0, rejected: 1, verified: 2 } as const;
  const listed = visits.toSorted(
    (a, b) => order[a.status] - order[b.status] || b.loggedAt.getTime() - a.loggedAt.getTime(),
  );

  return (
    <>
      <PageHeader
        title="Field visits"
        description="Client visits and geo-tagged location photos on the map. Verify or reject each one."
      />

      <FilterBar clearHref="/visits">
        <FilterField label="Date" htmlFor="f-date">
          <Input id="f-date" name="date" type="date" defaultValue={date ?? ""} max={today} />
        </FilterField>
        <FilterField label="Employee" htmlFor="f-emp" className="sm:min-w-56">
          <NativeSelect id="f-emp" name="employee" defaultValue={sp.employee ?? ""} placeholder="All employees" options={empOpts} />
        </FilterField>
        <FilterField label="Status" htmlFor="f-status">
          <NativeSelect
            id="f-status"
            name="status"
            defaultValue={status ?? ""}
            placeholder="All statuses"
            options={Object.entries(visitStatus).map(([value, l]) => ({ value, label: l.label }))}
          />
        </FilterField>
        <FilterField label="Purpose" htmlFor="f-purpose">
          <NativeSelect
            id="f-purpose"
            name="purpose"
            defaultValue={purpose ?? ""}
            placeholder="All purposes"
            options={Object.entries(visitPurpose).map(([value, label]) => ({ value, label }))}
          />
        </FilterField>
      </FilterBar>

      <section
        aria-label="Visit summary"
        className={`grid grid-cols-2 gap-3 ${distance != null ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}
      >
        <StatCard label="Visits" value={visits.length} hint={rangeLabel} icon={<MapPinnedIcon />} />
        <StatCard
          label="Pending"
          value={counts.pending}
          tone={counts.pending ? "warning" : "default"}
          icon={<ClockIcon />}
          href={`/visits?status=pending${employeeId ? `&employee=${employeeId}` : ""}`}
        />
        <StatCard label="Verified" value={counts.verified} tone="success" icon={<CheckCircle2Icon />} />
        <StatCard
          label="Rejected"
          value={counts.rejected}
          tone={counts.rejected ? "danger" : "default"}
          icon={<XCircleIcon />}
        />
        {distance != null ? (
          <StatCard
            label="Distance travelled"
            value={formatDistance(distance)}
            hint="Straight line between stops"
            tone="brand"
            icon={<RouteIcon />}
          />
        ) : null}
      </section>

      <section aria-label="Visit map" className="flex flex-col gap-2">
        <VisitMapLoader points={points} center={center} showRoute={showRoute} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <Legend className="bg-warning" label="Pending" />
          <Legend className="bg-success" label="Verified" />
          <Legend className="bg-destructive" label="Rejected" />
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="grid size-3.5 place-items-center rounded-[3px] bg-brand-aqua">
              <CameraIcon className="size-2.5 text-white" />
            </span>
            Location tag (photo)
          </span>
          {showRoute ? (
            <span>Numbers show the order of the day&apos;s stops.</span>
          ) : (
            <span>Pick one employee and a date to see their route.</span>
          )}
        </div>
      </section>

      {listed.length === 0 ? (
        <EmptyState
          icon={<MapPinOffIcon />}
          title={status === "pending" ? "No visits waiting for review" : "No visits match"}
          description="Visits logged from the staff app appear here and on the map."
        />
      ) : (
        <section aria-label="Visits" className="grid gap-3 lg:grid-cols-2">
          {listed.map((v) => (
            <VisitCard key={v.id} v={v} tz={tz} showDate={!date} />
          ))}
        </section>
      )}
    </>
  );
}

function visitTitle(v: VisitRow) {
  if (v.purpose === "location_tag") return v.placeLabel ?? "Location tag";
  return v.client?.name ?? v.prospectName ?? "New prospect";
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={`size-2.5 rounded-full ${className}`} />
      {label}
    </span>
  );
}

function VisitCard({ v, tz, showDate }: { v: VisitRow; tz: string; showDate: boolean }) {
  const flags = v.flags ?? {};
  const site = v.site ? [v.site.label, v.site.area, v.site.city].filter(Boolean).join(", ") : null;
  const title = visitTitle(v);

  return (
    <Card id={`visit-${v.id}`} className="scroll-mt-20 gap-3 p-4">
      <div className="flex items-start gap-3">
        <PhotoThumb src={fileUrl(v.photoKey)} alt={`Visit photo at ${title}`} size={64} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-semibold">{title}</h3>
            {v.purpose === "location_tag" ? (
              <StatusBadge label="Location tag" tone="info" />
            ) : !v.client ? (
              <StatusBadge label="Prospect" tone="info" />
            ) : null}
            <span className="ml-auto">{badgeFrom(labelOf(visitStatus, v.status))}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {v.employee.name} · {showDate ? formatDateTime(v.loggedAt, tz) : formatTime(v.loggedAt, tz)}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {v.purpose !== "location_tag" ? <StatusBadge label={visitPurpose[v.purpose] ?? v.purpose} tone="brand" /> : null}
            {v.outcome ? badgeFrom(labelOf(visitOutcome, v.outcome)) : null}
          </div>
        </div>
      </div>

      {site || v.contactName || v.prospectPhone ? (
        <p className="text-xs text-muted-foreground">
          {[site, v.contactName, formatPhone(v.contactPhone ?? v.prospectPhone)].filter(Boolean).join(" · ")}
        </p>
      ) : null}
      {v.notes ? <p className="text-sm whitespace-pre-line">{v.notes}</p> : null}

      {flags.weakGps || flags.farFromSite ? (
        <div className="flex flex-wrap gap-1.5">
          {flags.weakGps ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning">
              <SatelliteDishIcon className="size-3" />
              Weak GPS{v.accuracyM ? ` (±${formatDistance(v.accuracyM)})` : ""}
            </span>
          ) : null}
          {flags.farFromSite ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
              <MapPinOffIcon className="size-3" />
              Far from site{v.distanceFromSiteM != null ? ` (${formatDistance(v.distanceFromSiteM)} away)` : ""}
            </span>
          ) : null}
        </div>
      ) : null}

      {v.status !== "pending" ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          {v.status === "verified" ? "Verified" : "Rejected"}
          {v.reviewer ? ` by ${v.reviewer.name}` : ""}
          {v.reviewedAt ? `, ${formatDateTime(v.reviewedAt, tz)}` : ""}
          {v.reviewRemark ? <span className="mt-0.5 block text-foreground">“{v.reviewRemark}”</span> : null}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-1.5">
        {v.status !== "verified" ? (
          <ActionButton
            action={verifyVisitAction}
            hidden={{ id: v.id }}
            variant={v.status === "pending" ? "default" : "outline"}
            pendingLabel="Verifying…"
          >
            Verify
          </ActionButton>
        ) : null}
        {v.status !== "rejected" ? (
          <ActionDialog
            action={rejectVisitAction}
            hidden={{ id: v.id }}
            remark="required"
            title={`Reject visit to ${title}?`}
            description={`${v.employee.name}, ${formatDateTime(v.loggedAt, tz)}. The remark is shown to the employee.`}
            confirmLabel="Reject"
            destructive
            trigger={
              <Button size="sm" variant={v.status === "pending" ? "outline" : "ghost"}>
                Reject
              </Button>
            }
          />
        ) : null}
      </div>
    </Card>
  );
}
