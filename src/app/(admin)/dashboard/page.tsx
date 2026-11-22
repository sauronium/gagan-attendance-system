import {
  AlertTriangleIcon,
  BellRingIcon,
  FileWarningIcon,
  MapPinnedIcon,
  MessageSquareTextIcon,
  WrenchIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AttendanceTrendChart } from "@/components/app/charts";
import { PageHeader } from "@/components/app/page-header";
import { PresencePanel } from "@/components/app/presence-panel";
import { StatCard } from "@/components/app/stat-card";
import { badgeFrom } from "@/components/app/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { env } from "@/lib/env";
import { labelOf, visitPurpose, visitStatus } from "@/lib/labels";
import { requireAdmin } from "@/lib/session";
import { formatDate, formatTime } from "@/lib/time";
import { getDashboard } from "@/server/dashboard";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const viewer = await requireAdmin();
  const tz = env.timezone;
  const d = await getDashboard(tz);
  const firstName = viewer.employee.name.split(" ")[0];

  const needsAction = [
    { label: "Leave requests pending", value: d.pending.leave, href: "/leave", tone: "warning" },
    { label: "Attendance corrections pending", value: d.pending.corrections, href: "/attendance?tab=corrections", tone: "warning" },
    { label: "Flagged check-ins today", value: d.counts.flagged, href: "/attendance?flagged=1", tone: "danger" },
    { label: "Field visits to verify", value: d.pending.visits, href: "/visits?status=pending", tone: "warning" },
    { label: "Service visits overdue", value: d.serviceOverdue, href: "/amc?tab=service&range=overdue", tone: "danger" },
    { label: "AMC expiring in 30 days", value: d.amcExpiring, href: "/amc?expiring=30", tone: "warning" },
    { label: "Open complaints", value: d.openComplaints, href: "/complaints", tone: "danger" },
    { label: "SMS failed (7 days)", value: d.smsFailed, href: "/messages?tab=log&status=failed", tone: "danger" },
  ] as const;

  return (
    <>
      <PageHeader
        title={`Good day, ${firstName}`}
        description={`Here's what's happening today, ${formatDate(d.today)}.`}
      />

      <PresencePanel counts={d.counts} active={d.activeStaff} />

      <section aria-label="Operations" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Field visits today" value={d.visitsToday} hint={`${d.pending.visits} awaiting verification`} icon={<MapPinnedIcon />} href="/visits" />
        <StatCard label="Service due this week" value={d.serviceDue} hint={d.serviceOverdue ? `${d.serviceOverdue} overdue` : "None overdue"} tone={d.serviceOverdue ? "warning" : "default"} icon={<WrenchIcon />} href="/amc?tab=service" />
        <StatCard label="Open complaints" value={d.openComplaints} tone={d.openComplaints ? "danger" : "default"} icon={<BellRingIcon />} href="/complaints" />
        <StatCard label="SMS sent today" value={d.smsToday} hint="Demo SMS API" icon={<MessageSquareTextIcon />} href="/messages" />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Attendance, last 14 days</CardTitle>
            <CardDescription>Staff marked present, late, on leave or absent each day</CardDescription>
          </CardHeader>
          <CardContent>
            <AttendanceTrendChart data={d.trend} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Needs action</CardTitle>
            <CardDescription>Items waiting on an admin</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col">
            {needsAction.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="flex items-center justify-between gap-3 border-b border-dashed py-2.5 text-sm last:border-0 hover:text-primary"
              >
                <span>{item.label}</span>
                <span
                  className={
                    item.value === 0
                      ? "rounded-full bg-muted px-2 text-xs font-semibold text-muted-foreground tabular-nums"
                      : item.tone === "danger"
                        ? "rounded-full bg-destructive/10 px-2 text-xs font-semibold text-destructive tabular-nums"
                        : "rounded-full bg-warning-soft px-2 text-xs font-semibold text-warning tabular-nums"
                  }
                >
                  {item.value}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>By department</CardTitle>
            <CardDescription>Today</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {d.departments.map((dep) => (
              <div key={dep.name} className="grid grid-cols-[7rem_1fr_2rem] items-center gap-3 text-sm">
                <span className="truncate text-muted-foreground">{dep.name}</span>
                <span className="flex h-2.5 overflow-hidden rounded-full bg-muted" aria-label={`${dep.present} present, ${dep.late} late, ${dep.leave} on leave, ${dep.absent} absent of ${dep.total}`}>
                  <span className="bg-chart-1" style={{ width: `${(dep.present / dep.total) * 100}%` }} />
                  <span className="bg-chart-4" style={{ width: `${(dep.late / dep.total) * 100}%` }} />
                  <span className="bg-chart-2" style={{ width: `${(dep.leave / dep.total) * 100}%` }} />
                  <span className="bg-destructive" style={{ width: `${(dep.absent / dep.total) * 100}%` }} />
                </span>
                <span className="text-right tabular-nums">{dep.total}</span>
              </div>
            ))}
            {!d.departments.length ? <p className="text-sm text-muted-foreground">No staff yet.</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Latest field visits</CardTitle>
            <CardDescription>
              <Link href="/visits" className="text-primary hover:underline">Open visit map</Link>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col">
            {d.recentVisits.map((v) => (
              <div key={v.id} className="flex items-start justify-between gap-3 border-b border-dashed py-2.5 text-sm last:border-0">
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {v.purpose === "location_tag" ? (v.placeLabel ?? "Location tag") : (v.client?.name ?? v.prospectName ?? "New prospect")}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {v.employee.name} · {visitPurpose[v.purpose]} · {formatTime(v.loggedAt, tz)}
                  </div>
                </div>
                {badgeFrom(labelOf(visitStatus, v.status))}
              </div>
            ))}
            {!d.recentVisits.length ? <p className="text-sm text-muted-foreground">No visits logged yet.</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upcoming service</CardTitle>
            <CardDescription>
              <Link href="/amc?tab=service" className="text-primary hover:underline">Service schedule</Link>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col">
            {d.upcomingService.map((s) => {
              const overdue = s.dueOn < d.today;
              return (
                <div key={s.id} className="flex items-start justify-between gap-3 border-b border-dashed py-2.5 text-sm last:border-0">
                  <div className="min-w-0">
                    <Link href={`/clients/${s.installation.site.client.id}`} className="block truncate font-medium hover:text-primary">
                      {s.installation.site.client.name}
                    </Link>
                    <div className="truncate text-xs text-muted-foreground">
                      {s.technician?.name ?? "Unassigned"} · {s.installation.site.area ?? s.installation.site.city ?? ""}
                    </div>
                  </div>
                  <span className={overdue ? "flex items-center gap-1 text-xs font-medium text-destructive" : "text-xs text-muted-foreground"}>
                    {overdue ? <AlertTriangleIcon className="size-3.5" /> : null}
                    {formatDate(s.dueOn)}
                  </span>
                </div>
              );
            })}
            {!d.upcomingService.length ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileWarningIcon className="size-4" /> Nothing scheduled.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
