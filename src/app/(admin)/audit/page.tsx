import { and, asc, desc, eq, gte, isNull, lt, type SQL } from "drizzle-orm";
import { ScrollTextIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/app/empty-state";
import { FilterBar, FilterField } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { env } from "@/lib/env";
import type { Tone } from "@/lib/labels";
import { requireRole } from "@/lib/session";
import { addDays, formatDateTime, zonedMidnight } from "@/lib/time";
import { employeeOptions } from "@/server/lookups";

export const metadata: Metadata = { title: "Audit log" };

type SearchParams = Promise<{
  table?: string;
  actor?: string;
  from?: string;
  to?: string;
  /** Cursor: show entries with id below this. */
  before?: string;
}>;

const PAGE = 100;
const SYSTEM_ACTOR = "system";

const actionTone: Record<string, Tone> = { create: "success", update: "info", delete: "danger" };

const isDate = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

export default async function AuditPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRole(["super_admin"]);
  const sp = await searchParams;
  const tz = env.timezone;
  const from = isDate(sp.from);
  const to = isDate(sp.to);
  const before = Number(sp.before) || undefined;

  const where: SQL[] = [];
  if (sp.table) where.push(eq(auditLog.tableName, sp.table));
  if (sp.actor === SYSTEM_ACTOR) where.push(isNull(auditLog.actorId));
  else if (Number(sp.actor)) where.push(eq(auditLog.actorId, Number(sp.actor)));
  if (from) where.push(gte(auditLog.createdAt, zonedMidnight(from, tz)));
  if (to) where.push(lt(auditLog.createdAt, zonedMidnight(addDays(to, 1), tz)));
  if (before) where.push(lt(auditLog.id, before));

  const [rows, tableRows, empOpts] = await Promise.all([
    // One extra row tells us whether an "older" page exists.
    db.query.auditLog.findMany({
      where: where.length ? and(...where) : undefined,
      orderBy: [desc(auditLog.id)],
      limit: PAGE + 1,
      with: { actor: { columns: { name: true, empCode: true } } },
    }),
    db.selectDistinct({ name: auditLog.tableName }).from(auditLog).orderBy(asc(auditLog.tableName)),
    employeeOptions(),
  ]);
  const hasOlder = rows.length > PAGE;
  const page = rows.slice(0, PAGE);

  // Keep the filters when paging.
  const params = new URLSearchParams();
  for (const k of ["table", "actor", "from", "to"] as const) {
    if (sp[k]) params.set(k, sp[k]!);
  }
  const olderHref = () => {
    const p = new URLSearchParams(params);
    p.set("before", String(page[page.length - 1].id));
    return `/audit?${p}`;
  };
  const newestHref = `/audit${params.size ? `?${params}` : ""}`;

  return (
    <>
      <PageHeader title="Audit log" description="Every manual change and approval: who did it, when and why." />

      <FilterBar clearHref="/audit">
        <FilterField label="Table" htmlFor="a-table" className="sm:min-w-44">
          <NativeSelect
            id="a-table"
            name="table"
            defaultValue={sp.table ?? ""}
            placeholder="All tables"
            options={tableRows.map((t) => ({ value: t.name, label: t.name }))}
          />
        </FilterField>
        <FilterField label="Actor" htmlFor="a-actor" className="sm:min-w-56">
          <NativeSelect
            id="a-actor"
            name="actor"
            defaultValue={sp.actor ?? ""}
            placeholder="Anyone"
            options={[{ value: SYSTEM_ACTOR, label: "System (scheduled jobs)" }, ...empOpts]}
          />
        </FilterField>
        <FilterField label="From" htmlFor="a-from">
          <Input id="a-from" name="from" type="date" defaultValue={from ?? ""} />
        </FilterField>
        <FilterField label="To" htmlFor="a-to">
          <Input id="a-to" name="to" type="date" defaultValue={to ?? ""} />
        </FilterField>
      </FilterBar>

      {page.length === 0 ? (
        <EmptyState icon={<ScrollTextIcon />} title="No audit entries match" description="Changes made in the admin portal are recorded here." />
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Record</TableHead>
                <TableHead>Action</TableHead>
                <TableHead className="min-w-56">Reason &amp; changes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.map((r) => (
                <TableRow key={r.id} className="align-top">
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(r.createdAt, tz)}</TableCell>
                  <TableCell>
                    {r.actor ? (
                      <>
                        <div className="font-medium">{r.actor.name}</div>
                        <div className="text-xs text-muted-foreground">{r.actor.empCode}</div>
                      </>
                    ) : (
                      <span className="text-muted-foreground">System</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <span className="font-mono text-xs">{r.tableName}</span>
                    <span className="text-muted-foreground"> #{r.recordId}</span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge label={r.action} tone={actionTone[r.action] ?? "neutral"} className="capitalize" />
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {r.reason ? <p className="mb-1 text-sm">{r.reason}</p> : null}
                    {r.before || r.after ? (
                      <details className="group text-xs">
                        <summary className="cursor-pointer text-muted-foreground select-none hover:text-foreground">
                          Show changes
                        </summary>
                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                          {r.before ? <JsonBlock label="Before" value={r.before} /> : null}
                          {r.after ? <JsonBlock label="After" value={r.after} /> : null}
                        </div>
                      </details>
                    ) : !r.reason ? (
                      <span className="text-muted-foreground">—</span>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <div className="flex items-center justify-between gap-2">
        {before ? (
          <Link href={newestHref} className={buttonVariants({ variant: "ghost" })}>
            ← Newest
          </Link>
        ) : (
          <span />
        )}
        {hasOlder ? (
          <Link href={olderHref()} className={buttonVariants({ variant: "outline" })}>
            Older entries
          </Link>
        ) : null}
      </div>
    </>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 font-medium text-muted-foreground">{label}</div>
      <pre className="max-h-64 overflow-auto rounded-md bg-muted p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
