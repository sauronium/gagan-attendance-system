import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { ArrowLeftIcon, BellRingIcon, FactoryIcon, FileCheck2Icon, HistoryIcon, MapPinIcon, PhoneIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AddContactDialog, AddInstallationDialog, AddSiteDialog, EditClientDialog } from "@/components/clients/client-forms";
import { NewComplaintDialog } from "@/components/clients/complaint-dialog";
import { ComplaintsTable } from "@/components/clients/complaints-table";
import { AddContractDialog } from "@/components/clients/contract-dialog";
import { ContractsTable } from "@/components/clients/contracts-table";
import { clientTypeLabel, planLabel, plantLabel, siteAddress } from "@/components/clients/format";
import { Timeline } from "@/components/clients/timeline";
import { VisitsTable } from "@/components/clients/visits-table";
import { EmptyState } from "@/components/app/empty-state";
import { LinkTabs } from "@/components/app/link-tabs";
import { PageHeader, SectionTitle } from "@/components/app/page-header";
import { badgeFrom, StatusBadge } from "@/components/app/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db";
import { amcContracts, clientContacts, clients, clientSites, complaints, installations, serviceVisits } from "@/db/schema";
import { env } from "@/lib/env";
import { clientSegment, clientStatus, labelOf } from "@/lib/labels";
import { formatPhone } from "@/lib/phone";
import { requireAdmin } from "@/lib/session";
import { formatDate, todayIso } from "@/lib/time";
import { cn } from "@/lib/utils";
import { listComplaints, listContracts, listServiceVisits } from "@/server/amc";
import { getClientTimeline, installationOptions } from "@/server/clients";
import { employeeOptions, technicianOptions } from "@/server/lookups";

export const metadata: Metadata = { title: "Client" };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; contract?: string }>;
};

const TABS = ["overview", "plants", "amc", "complaints", "timeline"] as const;
type Tab = (typeof TABS)[number];

async function loadClient(id: number) {
  return db.query.clients.findFirst({
    where: eq(clients.id, id),
    with: {
      salesOwner: { columns: { id: true, name: true } },
      contacts: { orderBy: [desc(clientContacts.isPrimary), asc(clientContacts.id)] },
      sites: {
        orderBy: asc(clientSites.id),
        with: { installations: { orderBy: asc(installations.id) } },
      },
    },
  });
}
type ClientDetail = NonNullable<Awaited<ReturnType<typeof loadClient>>>;

export default async function ClientPage({ params, searchParams }: Props) {
  await requireAdmin();
  const [{ id: rawId }, sp] = await Promise.all([params, searchParams]);
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const client = await loadClient(id);
  if (!client) notFound();

  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as Tab) : "overview";
  const today = todayIso(env.timezone);
  const plantIds = client.sites.flatMap((s) => s.installations.map((i) => i.id));
  const [owners, openComplaints, activeContracts] = await Promise.all([
    employeeOptions(),
    db.$count(
      complaints,
      and(eq(complaints.clientId, id), inArray(complaints.status, ["open", "assigned", "in_progress"])),
    ),
    plantIds.length
      ? db.$count(amcContracts, and(inArray(amcContracts.installationId, plantIds), eq(amcContracts.status, "active")))
      : Promise.resolve(0),
  ]);
  const href = (t: Tab) => (t === "overview" ? `/clients/${id}` : `/clients/${id}?tab=${t}`);

  return (
    <>
      <PageHeader
        title={client.name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {badgeFrom(labelOf(clientStatus, client.status))}
            {client.segment ? <StatusBadge label={clientSegment[client.segment]} tone="brand" /> : null}
            <span>{clientTypeLabel[client.type] ?? client.type}</span>
            <span>Sales owner: {client.salesOwner?.name ?? "Unassigned"}</span>
            {client.gstNo ? <span className="tabular-nums">GSTIN {client.gstNo}</span> : null}
          </span>
        }
        actions={
          <>
            <Link href="/clients" className={buttonVariants({ variant: "ghost" })}>
              <ArrowLeftIcon /> Clients
            </Link>
            <EditClientDialog
              clientId={client.id}
              owners={owners}
              defaults={{
                name: client.name,
                type: client.type,
                gstNo: client.gstNo,
                segment: client.segment,
                source: client.source,
                salesOwnerId: client.salesOwnerId,
                status: client.status,
                tags: client.tags,
                notes: client.notes,
              }}
            />
          </>
        }
      />

      <LinkTabs
        active={tab}
        tabs={[
          { key: "overview", label: "Overview", href: href("overview") },
          { key: "plants", label: "Plants", href: href("plants"), count: plantIds.length },
          { key: "amc", label: "AMC", href: href("amc"), count: activeContracts },
          { key: "complaints", label: "Complaints", href: href("complaints"), count: openComplaints },
          { key: "timeline", label: "Timeline", href: href("timeline") },
        ]}
      />

      {tab === "overview" ? <Overview client={client} /> : null}
      {tab === "plants" ? <Plants client={client} today={today} /> : null}
      {tab === "amc" ? <Amc client={client} plantIds={plantIds} today={today} selected={Number(sp.contract) || null} /> : null}
      {tab === "complaints" ? <Complaints clientId={id} /> : null}
      {tab === "timeline" ? <TimelineTab clientId={id} /> : null}
    </>
  );
}

// ── Overview ─────────────────────────────────────────────────

function Overview({ client }: { client: ClientDetail }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Contacts</CardTitle>
          <CardDescription>Automatic SMS go to the primary contact if opted in.</CardDescription>
          <CardAction>
            <AddContactDialog clientId={client.id} />
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col">
          {client.contacts.length === 0 ? <p className="text-sm text-muted-foreground">No contacts yet.</p> : null}
          {client.contacts.map((c) => (
            <div key={c.id} className="flex flex-wrap items-start justify-between gap-2 border-b border-dashed py-2.5 last:border-0">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 font-medium">
                  {c.name}
                  {c.isPrimary ? <StatusBadge label="Primary" tone="brand" /> : null}
                </div>
                <div className="text-xs text-muted-foreground">
                  {[c.designation, c.email].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 text-sm">
                <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 tabular-nums hover:text-primary">
                  <PhoneIcon className="size-3.5" aria-hidden /> {formatPhone(c.phone)}
                </a>
                {c.altPhone ? <span className="text-xs text-muted-foreground tabular-nums">{formatPhone(c.altPhone)}</span> : null}
                <StatusBadge label={c.smsOptIn ? "SMS on" : "SMS off"} tone={c.smsOptIn ? "success" : "neutral"} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sites</CardTitle>
          <CardDescription>Addresses where plants are installed.</CardDescription>
          <CardAction>
            <AddSiteDialog clientId={client.id} />
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col">
          {client.sites.length === 0 ? <p className="text-sm text-muted-foreground">No sites yet.</p> : null}
          {client.sites.map((s) => (
            <div key={s.id} className="flex items-start justify-between gap-3 border-b border-dashed py-2.5 last:border-0">
              <div className="min-w-0">
                <div className="font-medium">{s.label || s.area || s.city || "Site"}</div>
                <div className="text-sm text-muted-foreground">{siteAddress(s)}</div>
                <div className="text-xs text-muted-foreground">
                  {s.installations.length} plant{s.installations.length === 1 ? "" : "s"}
                  {s.state ? ` · ${s.state}` : ""}
                </div>
              </div>
              {s.lat != null && s.lng != null ? (
                <a
                  href={`https://www.google.com/maps?q=${s.lat},${s.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
                >
                  <MapPinIcon className="size-3.5" aria-hidden /> Map
                </a>
              ) : (
                <span className="shrink-0 text-xs text-muted-foreground">No pin</span>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {client.notes || client.tags?.length || client.source ? (
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {client.source ? <div><span className="text-muted-foreground">Lead source:</span> {client.source}</div> : null}
            {client.tags?.length ? (
              <div className="flex flex-wrap gap-1.5">
                {client.tags.map((t) => (
                  <StatusBadge key={t} label={t} tone="neutral" />
                ))}
              </div>
            ) : null}
            {client.notes ? <p className="whitespace-pre-line">{client.notes}</p> : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

// ── Plants ───────────────────────────────────────────────────

function Plants({ client, today }: { client: ClientDetail; today: string }) {
  const siteOptions = client.sites.map((s) => ({ value: String(s.id), label: s.label || siteAddress(s) }));
  const total = client.sites.reduce((n, s) => n + s.installations.length, 0);
  return (
    <div className="flex flex-col gap-4">
      <SectionTitle action={siteOptions.length ? <AddInstallationDialog clientId={client.id} sites={siteOptions} /> : null}>
        Installed plants
      </SectionTitle>
      {total === 0 ? (
        <EmptyState
          icon={<FactoryIcon />}
          title="No plants yet"
          description={siteOptions.length ? "Add the RO plants installed at this client's sites." : "Add a site first on the Overview tab."}
        />
      ) : (
        client.sites
          .filter((s) => s.installations.length)
          .map((s) => (
            <div key={s.id} className="flex flex-col gap-2">
              <h3 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                <MapPinIcon className="size-4" aria-hidden /> {s.label ? `${s.label} · ` : ""}
                {siteAddress(s)}
              </h3>
              <Card className="py-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Plant</TableHead>
                      <TableHead className="hidden sm:table-cell">Serial</TableHead>
                      <TableHead className="hidden md:table-cell">Membrane</TableHead>
                      <TableHead className="hidden md:table-cell">Installed</TableHead>
                      <TableHead>Warranty</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {s.installations.map((i) => {
                      const expired = i.warrantyUntil != null && i.warrantyUntil < today;
                      return (
                        <TableRow key={i.id}>
                          <TableCell>
                            <div className="font-medium">{plantLabel(i)}</div>
                            {i.plantType && i.model ? <div className="text-xs text-muted-foreground">{i.plantType}</div> : null}
                          </TableCell>
                          <TableCell className="hidden tabular-nums sm:table-cell">{i.serialNo ?? "—"}</TableCell>
                          <TableCell className="hidden md:table-cell">{i.membraneSpec ?? "—"}</TableCell>
                          <TableCell className="hidden whitespace-nowrap md:table-cell">{formatDate(i.installedOn)}</TableCell>
                          <TableCell className={cn("whitespace-nowrap", expired && "text-destructive")}>
                            {i.warrantyUntil ? (expired ? `Ended ${formatDate(i.warrantyUntil)}` : formatDate(i.warrantyUntil)) : "—"}
                          </TableCell>
                          <TableCell>
                            <StatusBadge label={i.status === "active" ? "Active" : "Removed"} tone={i.status === "active" ? "success" : "neutral"} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
            </div>
          ))
      )}
    </div>
  );
}

// ── AMC ──────────────────────────────────────────────────────

async function Amc({
  client,
  plantIds,
  today,
  selected,
}: {
  client: ClientDetail;
  plantIds: number[];
  today: string;
  selected: number | null;
}) {
  const [contracts, plantOpts, technicians] = await Promise.all([
    plantIds.length ? listContracts(inArray(amcContracts.installationId, plantIds)) : Promise.resolve([]),
    installationOptions(client.id),
    technicianOptions(),
  ]);
  // Newest first on a client page.
  contracts.sort((a, b) => (a.startOn < b.startOn ? 1 : -1));
  const current =
    contracts.find((k) => k.id === selected) ?? contracts.find((k) => k.status === "active") ?? contracts[0] ?? null;
  const visits = current ? await listServiceVisits(eq(serviceVisits.contractId, current.id)) : [];

  return (
    <div className="flex flex-col gap-4">
      <SectionTitle action={<AddContractDialog installations={plantOpts} today={today} />}>AMC contracts</SectionTitle>
      {contracts.length === 0 ? (
        <EmptyState
          icon={<FileCheck2Icon />}
          title="No AMC contracts"
          description={plantOpts.length ? "Create a contract to schedule service visits automatically." : "Add a plant on the Plants tab first."}
        />
      ) : (
        <ContractsTable
          rows={contracts}
          today={today}
          contractHref={(cid) => `/clients/${client.id}?tab=amc&contract=${cid}`}
          selectedId={current?.id}
        />
      )}

      {current ? (
        <>
          <SectionTitle>
            Service visits · {current.contractNo}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {planLabel[current.plan]}
              {current.filterChangeEveryDays ? ` · filter every ${current.filterChangeEveryDays} days` : ""}
              {current.membraneChangeEveryDays ? ` · membrane every ${current.membraneChangeEveryDays} days` : ""}
            </span>
          </SectionTitle>
          {visits.length === 0 ? (
            <p className="text-sm text-muted-foreground">No service visits on this contract.</p>
          ) : (
            <VisitsTable rows={visits} technicians={technicians} today={today} />
          )}
        </>
      ) : null}
    </div>
  );
}

// ── Complaints ───────────────────────────────────────────────

async function Complaints({ clientId }: { clientId: number }) {
  const [rows, plantOpts, technicians] = await Promise.all([
    listComplaints(eq(complaints.clientId, clientId)),
    installationOptions(clientId),
    technicianOptions(),
  ]);
  return (
    <div className="flex flex-col gap-4">
      <SectionTitle action={<NewComplaintDialog installations={plantOpts} size="sm" />}>Complaints</SectionTitle>
      {rows.length === 0 ? (
        <EmptyState icon={<BellRingIcon />} title="No complaints" description="Breakdowns logged for this client's plants appear here." />
      ) : (
        <ComplaintsTable rows={rows} technicians={technicians} />
      )}
    </div>
  );
}

// ── Timeline ─────────────────────────────────────────────────

async function TimelineTab({ clientId }: { clientId: number }) {
  const items = await getClientTimeline(clientId);
  if (!items.length) {
    return <EmptyState icon={<HistoryIcon />} title="Nothing yet" description="Visits, service, complaints and SMS for this client appear here." />;
  }
  return <Timeline items={items} />;
}
