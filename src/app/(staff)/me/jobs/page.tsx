import { NavigationIcon, PhoneIcon, WrenchIcon } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader, SectionTitle } from "@/components/app/page-header";
import { badgeFrom, StatusBadge } from "@/components/app/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { brand } from "@/lib/brand";
import { env } from "@/lib/env";
import { complaintPriority, labelOf } from "@/lib/labels";
import { formatPhone } from "@/lib/phone";
import { requireViewer } from "@/lib/session";
import { addDays, formatDate, todayIso, weekdayShort } from "@/lib/time";
import { cn } from "@/lib/utils";
import { addMonthsIso, type AssignedJob, getAssignedJobs } from "@/server/staff";

import { DoneDialog } from "./done-dialog";

export const metadata: Metadata = { title: "Jobs" };

const typeLabel: Record<string, string> = {
  amc: "AMC service",
  complaint: "Complaint",
  installation: "Installation",
  paid: "Paid service",
};

function mapsUrl(site: AssignedJob["installation"]["site"]) {
  const query =
    site.lat != null && site.lng != null
      ? `${site.lat},${site.lng}`
      : [site.addressLine, site.area, site.city, site.state, site.pincode].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export default async function MyJobsPage() {
  const viewer = await requireViewer();
  const me = viewer.employee;
  if (me.role !== "technician") redirect("/me");

  const today = todayIso(env.timezone);
  const jobs = await getAssignedJobs(me.id, addDays(today, 14));
  const overdue = jobs.filter((j) => j.dueOn < today);
  const dueToday = jobs.filter((j) => j.dueOn === today);
  const upcoming = jobs.filter((j) => j.dueOn > today);
  const watermark = `${brand.company} · ${me.name}`;

  const sections = [
    { key: "overdue", title: "Overdue", jobs: overdue },
    { key: "today", title: "Today", jobs: dueToday },
    { key: "upcoming", title: "Next 14 days", jobs: upcoming },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Jobs" description="Service visits assigned to you." />
      {jobs.length === 0 ? (
        <EmptyState icon={<WrenchIcon />} title="No jobs assigned" description="New service visits assigned to you appear here." />
      ) : (
        sections.map((s) =>
          s.jobs.length ? (
            <section key={s.key} className="flex flex-col gap-2">
              <SectionTitle>
                {s.title}{" "}
                <span className={cn("font-normal", s.key === "overdue" ? "text-destructive" : "text-muted-foreground")}>
                  ({s.jobs.length})
                </span>
              </SectionTitle>
              <ul className="flex flex-col gap-3">
                {s.jobs.map((j) => (
                  <JobCard key={j.id} job={j} today={today} watermark={watermark} />
                ))}
              </ul>
            </section>
          ) : null,
        )
      )}
    </div>
  );
}

function JobCard({ job, today, watermark }: { job: AssignedJob; today: string; watermark: string }) {
  const inst = job.installation;
  const site = inst.site;
  const client = site.client;
  const contact = client.contacts.find((c) => c.isPrimary) ?? client.contacts[0];
  const address = [site.addressLine, site.area, site.city].filter(Boolean).join(", ");
  const plant = [
    inst.capacityLph ? `${inst.capacityLph.toLocaleString("en-IN")} LPH` : null,
    inst.plantType,
    inst.model,
  ]
    .filter(Boolean)
    .join(" · ");
  const defaultNextDue = job.type === "amc" ? addMonthsIso(job.dueOn, 3) : undefined;

  return (
    <li className="flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{client.name}</p>
          <p className="text-xs text-muted-foreground">
            {typeLabel[job.type] ?? job.type} · due {weekdayShort(job.dueOn)}, {formatDate(job.dueOn)}
            {job.contract ? ` · ${job.contract.contractNo}` : ""}
          </p>
        </div>
        {job.dueOn < today ? (
          <StatusBadge label="Overdue" tone="danger" />
        ) : job.dueOn === today ? (
          <StatusBadge label="Today" tone="info" />
        ) : (
          <StatusBadge label="Scheduled" tone="neutral" />
        )}
      </div>

      {job.complaint ? (
        <div className="rounded-lg bg-muted px-3 py-2 text-sm">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xs font-medium">Ticket {job.complaint.ticketNo}</span>
            {badgeFrom(labelOf(complaintPriority, job.complaint.priority))}
          </div>
          <p className="line-clamp-3 text-foreground/90">{job.complaint.issue}</p>
        </div>
      ) : null}

      <dl className="grid gap-1 text-sm">
        <div>
          <dt className="sr-only">Address</dt>
          <dd className="text-foreground/90">{address}</dd>
        </div>
        {plant ? (
          <div>
            <dt className="sr-only">Plant</dt>
            <dd className="text-muted-foreground">{plant}</dd>
          </div>
        ) : null}
        {contact ? (
          <div className="flex items-center gap-2">
            <dt className="sr-only">Contact</dt>
            <dd className="flex min-w-0 items-center gap-2">
              <span className="truncate">{contact.name}</span>
              <a href={`tel:${contact.phone}`} className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline">
                <PhoneIcon className="size-3.5" /> {formatPhone(contact.phone)}
              </a>
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="flex gap-2 pt-1">
        <a
          href={mapsUrl(site)}
          target="_blank"
          rel="noreferrer"
          className={cn(buttonVariants({ variant: "outline" }), "h-11 flex-1")}
        >
          <NavigationIcon /> Navigate
        </a>
        <DoneDialog
          visitId={job.id}
          clientName={client.name}
          defaultNextDue={defaultNextDue}
          minNextDue={today}
          watermark={watermark}
        />
      </div>
    </li>
  );
}
