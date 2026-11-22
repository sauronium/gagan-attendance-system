import { and, asc, desc, eq, inArray, like, or, type SQL } from "drizzle-orm";
import { Building2Icon, PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { clientTypeLabel, siteArea } from "@/components/clients/format";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar, FilterField } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { badgeFrom } from "@/components/app/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db";
import {
  type ClientSegment,
  type ClientStatus,
  clientContacts,
  clients,
  clientSegments,
  clientSites,
  clientStatuses,
  installations,
} from "@/db/schema";
import { clientSegment, clientStatus, labelOf } from "@/lib/labels";
import { formatPhone } from "@/lib/phone";
import { requireAdmin } from "@/lib/session";
import { cityOptions } from "@/server/clients";

export const metadata: Metadata = { title: "Clients" };

type SearchParams = Promise<{ q?: string; segment?: string; status?: string; city?: string }>;

const LIMIT = 200;

export default async function ClientsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";

  const where: SQL[] = [];
  if (sp.segment && (clientSegments as readonly string[]).includes(sp.segment)) {
    where.push(eq(clients.segment, sp.segment as ClientSegment));
  }
  if (sp.status && (clientStatuses as readonly string[]).includes(sp.status)) {
    where.push(eq(clients.status, sp.status as ClientStatus));
  }
  if (sp.city) where.push(eq(clientSites.city, sp.city));
  if (q) {
    const digits = q.replace(/\D/g, "");
    const conds: SQL[] = [
      like(clients.name, `%${q}%`),
      like(clients.gstNo, `%${q.toUpperCase()}%`),
      like(clientSites.area, `%${q}%`),
      like(installations.serialNo, `%${q}%`),
    ];
    if (digits.length >= 4) conds.push(like(clientContacts.phone, `%${digits}%`));
    where.push(or(...conds)!);
  }

  // Filters span contacts / sites / plants, so find matching ids first, then load rows with relations.
  const [idRows, cities] = await Promise.all([
    db
      .selectDistinct({ id: clients.id, name: clients.name })
      .from(clients)
      .leftJoin(clientContacts, eq(clientContacts.clientId, clients.id))
      .leftJoin(clientSites, eq(clientSites.clientId, clients.id))
      .leftJoin(installations, eq(installations.siteId, clientSites.id))
      .where(where.length ? and(...where) : undefined)
      .orderBy(asc(clients.name))
      .limit(LIMIT),
    cityOptions(),
  ]);
  const ids = idRows.map((r) => r.id);

  const rows = ids.length
    ? await db.query.clients.findMany({
        where: inArray(clients.id, ids),
        orderBy: asc(clients.name),
        with: {
          contacts: {
            columns: { name: true, phone: true },
            orderBy: [desc(clientContacts.isPrimary), asc(clientContacts.id)],
            limit: 1,
          },
          sites: {
            columns: { area: true, city: true },
            orderBy: asc(clientSites.id),
            with: {
              installations: {
                columns: { id: true, status: true },
                with: { contracts: { columns: { status: true } } },
              },
            },
          },
        },
      })
    : [];

  const filtered = Boolean(q || sp.segment || sp.status || sp.city);

  return (
    <>
      <PageHeader
        title="Clients"
        description="Client directory with contacts, sites, installed plants and AMC contracts."
        actions={
          <Link href="/clients/new" className={buttonVariants({ size: "lg" })}>
            <PlusIcon /> New client
          </Link>
        }
      />

      <FilterBar clearHref="/clients">
        <FilterField label="Search" htmlFor="f-q" className="sm:min-w-64">
          <Input id="f-q" name="q" type="search" defaultValue={q} placeholder="Name, GSTIN, phone, area or serial" />
        </FilterField>
        <FilterField label="Segment" htmlFor="f-segment">
          <NativeSelect
            id="f-segment"
            name="segment"
            defaultValue={sp.segment ?? ""}
            placeholder="All segments"
            options={Object.entries(clientSegment).map(([value, label]) => ({ value, label }))}
          />
        </FilterField>
        <FilterField label="Status" htmlFor="f-status">
          <NativeSelect
            id="f-status"
            name="status"
            defaultValue={sp.status ?? ""}
            placeholder="All statuses"
            options={Object.entries(clientStatus).map(([value, v]) => ({ value, label: v.label }))}
          />
        </FilterField>
        <FilterField label="City" htmlFor="f-city">
          <NativeSelect id="f-city" name="city" defaultValue={sp.city ?? ""} placeholder="All cities" options={cities} />
        </FilterField>
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Building2Icon />}
          title={filtered ? "No clients match" : "No clients yet"}
          description={filtered ? "Try a different search or clear the filters." : "Add your first client with a contact and site."}
          action={
            filtered ? null : (
              <Link href="/clients/new" className={buttonVariants()}>
                <PlusIcon /> New client
              </Link>
            )
          }
        />
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead className="hidden md:table-cell">Segment</TableHead>
                <TableHead className="hidden md:table-cell">Area / city</TableHead>
                <TableHead>Primary contact</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Active AMC</TableHead>
                <TableHead className="hidden text-right lg:table-cell">Plants</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => {
                const plants = c.sites.flatMap((s) => s.installations).filter((i) => i.status === "active");
                const activeContracts = c.sites
                  .flatMap((s) => s.installations)
                  .flatMap((i) => i.contracts)
                  .filter((k) => k.status === "active").length;
                const contact = c.contacts[0];
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link href={`/clients/${c.id}`} className="font-medium hover:text-primary hover:underline">
                        {c.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">{clientTypeLabel[c.type] ?? c.type}</div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{c.segment ? clientSegment[c.segment] : "—"}</TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {siteArea(c.sites[0]) || "—"}
                      {c.sites.length > 1 ? <span className="text-xs"> +{c.sites.length - 1}</span> : null}
                    </TableCell>
                    <TableCell>
                      {contact ? (
                        <>
                          <div className="max-w-40 truncate">{contact.name}</div>
                          <a href={`tel:${contact.phone}`} className="text-xs text-muted-foreground tabular-nums hover:text-primary">
                            {formatPhone(contact.phone)}
                          </a>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{activeContracts}</TableCell>
                    <TableCell className="hidden text-right tabular-nums lg:table-cell">{plants.length}</TableCell>
                    <TableCell>{badgeFrom(labelOf(clientStatus, c.status))}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
      {rows.length === LIMIT ? (
        <p className="text-xs text-muted-foreground">Showing the first {LIMIT} clients. Narrow the search to see more.</p>
      ) : null}
    </>
  );
}
