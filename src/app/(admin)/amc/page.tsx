import { and, eq, gte, inArray, isNull, lt, lte, ne, type SQL } from "drizzle-orm";
import { CalendarClockIcon, FileCheck2Icon, FileWarningIcon, IndianRupeeIcon, WrenchIcon } from "lucide-react";
import type { Metadata } from "next";

import { ContractsTable } from "@/components/clients/contracts-table";
import { VisitsTable } from "@/components/clients/visits-table";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar, FilterField } from "@/components/app/filter-bar";
import { LinkTabs } from "@/components/app/link-tabs";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { NativeSelect } from "@/components/ui/native-select";
import { db } from "@/db";
import {
  amcContracts,
  type ContractStatus,
  contractStatuses,
  type PaymentStatus,
  paymentStatuses,
  serviceVisits,
  type ServiceVisitStatus,
  serviceVisitStatuses,
} from "@/db/schema";
import { env } from "@/lib/env";
import { contractStatus, paymentStatus, serviceVisitStatus } from "@/lib/labels";
import { requireAdmin } from "@/lib/session";
import { addDays, todayIso } from "@/lib/time";
import { listContracts, listServiceVisits } from "@/server/amc";
import { technicianOptions } from "@/server/lookups";

export const metadata: Metadata = { title: "AMC & service" };

type SearchParams = Promise<{
  tab?: string;
  status?: string;
  expiring?: string;
  payment?: string;
  range?: string;
  technician?: string;
}>;

export default async function AmcPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const tab = sp.tab === "service" ? "service" : "contracts";
  const today = todayIso(env.timezone);
  const in30 = addDays(today, 30);

  const [active, expiring, unpaid, overdue] = await Promise.all([
    db.$count(amcContracts, eq(amcContracts.status, "active")),
    db.$count(amcContracts, and(eq(amcContracts.status, "active"), lte(amcContracts.endOn, in30))),
    db.$count(
      amcContracts,
      and(inArray(amcContracts.paymentStatus, ["unpaid", "partial"]), ne(amcContracts.status, "cancelled")),
    ),
    db.$count(serviceVisits, and(eq(serviceVisits.status, "scheduled"), lt(serviceVisits.dueOn, today))),
  ]);

  return (
    <>
      <PageHeader title="AMC & service" description="Contracts, renewals, payments and the technician service schedule." />

      <section aria-label="AMC summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Active contracts" value={active} icon={<FileCheck2Icon />} href="/amc" />
        <StatCard
          label="Expiring in 30 days"
          value={expiring}
          tone={expiring ? "warning" : "default"}
          icon={<FileWarningIcon />}
          href="/amc?expiring=30"
        />
        <StatCard
          label="Unpaid / partial"
          value={unpaid}
          tone={unpaid ? "danger" : "default"}
          icon={<IndianRupeeIcon />}
          href="/amc?status=all&payment=due"
        />
        <StatCard
          label="Service overdue"
          value={overdue}
          tone={overdue ? "danger" : "default"}
          icon={<WrenchIcon />}
          href="/amc?tab=service&range=overdue"
        />
      </section>

      <LinkTabs
        active={tab}
        tabs={[
          { key: "contracts", label: "Contracts", href: "/amc" },
          { key: "service", label: "Service", href: "/amc?tab=service", count: overdue },
        ]}
      />
      {tab === "contracts" ? <Contracts sp={sp} today={today} /> : <Service sp={sp} today={today} />}
    </>
  );
}

async function Contracts({ sp, today }: { sp: Awaited<SearchParams>; today: string }) {
  const expiring = [30, 60, 90].includes(Number(sp.expiring)) ? Number(sp.expiring) : null;
  const status = sp.status ?? "active";
  const where: SQL[] = [];
  if (expiring) {
    where.push(eq(amcContracts.status, "active"), lte(amcContracts.endOn, addDays(today, expiring)));
  } else if ((contractStatuses as readonly string[]).includes(status)) {
    where.push(eq(amcContracts.status, status as ContractStatus));
  }
  if (sp.payment === "due") where.push(inArray(amcContracts.paymentStatus, ["unpaid", "partial"]));
  else if (sp.payment && (paymentStatuses as readonly string[]).includes(sp.payment)) {
    where.push(eq(amcContracts.paymentStatus, sp.payment as PaymentStatus));
  }
  const rows = await listContracts(where.length ? and(...where) : undefined);

  return (
    <>
      <FilterBar clearHref="/amc">
        <FilterField label="Status" htmlFor="f-status">
          <NativeSelect
            id="f-status"
            name="status"
            defaultValue={expiring ? "active" : status}
            options={[
              ...contractStatuses.map((s) => ({ value: s, label: contractStatus[s].label })),
              { value: "all", label: "All" },
            ]}
          />
        </FilterField>
        <FilterField label="Expiring within" htmlFor="f-expiring">
          <NativeSelect
            id="f-expiring"
            name="expiring"
            defaultValue={expiring ? String(expiring) : ""}
            placeholder="Any time"
            options={[
              { value: "30", label: "30 days" },
              { value: "60", label: "60 days" },
              { value: "90", label: "90 days" },
            ]}
          />
        </FilterField>
        <FilterField label="Payment" htmlFor="f-payment">
          <NativeSelect
            id="f-payment"
            name="payment"
            defaultValue={sp.payment ?? ""}
            placeholder="Any payment"
            options={[
              { value: "due", label: "Unpaid or partial" },
              ...paymentStatuses.map((p) => ({ value: p, label: paymentStatus[p].label })),
            ]}
          />
        </FilterField>
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState
          icon={<FileCheck2Icon />}
          title={expiring ? `No contracts expiring in ${expiring} days` : "No contracts match"}
          description="Contracts are added from a client's AMC tab."
        />
      ) : (
        <ContractsTable rows={rows} today={today} showClient />
      )}
    </>
  );
}

async function Service({ sp, today }: { sp: Awaited<SearchParams>; today: string }) {
  const range = ["overdue", "week", "month", "upcoming"].includes(sp.range ?? "") ? sp.range! : "";
  const status = range === "overdue" ? "scheduled" : (sp.status ?? "scheduled");
  const where: SQL[] = [];
  if ((serviceVisitStatuses as readonly string[]).includes(status)) {
    where.push(eq(serviceVisits.status, status as ServiceVisitStatus));
  }
  if (range === "overdue") where.push(lt(serviceVisits.dueOn, today));
  if (range === "week") where.push(gte(serviceVisits.dueOn, today), lte(serviceVisits.dueOn, addDays(today, 6)));
  if (range === "month") where.push(gte(serviceVisits.dueOn, today), lte(serviceVisits.dueOn, addDays(today, 29)));
  if (range === "upcoming") where.push(gte(serviceVisits.dueOn, today));
  if (sp.technician === "none") where.push(isNull(serviceVisits.technicianId));
  else if (Number(sp.technician)) where.push(eq(serviceVisits.technicianId, Number(sp.technician)));

  const [rows, technicians] = await Promise.all([
    listServiceVisits(where.length ? and(...where) : undefined),
    technicianOptions(),
  ]);

  return (
    <>
      <FilterBar clearHref="/amc?tab=service">
        <input type="hidden" name="tab" value="service" />
        <FilterField label="Due" htmlFor="f-range">
          <NativeSelect
            id="f-range"
            name="range"
            defaultValue={range}
            placeholder="Any date"
            options={[
              { value: "overdue", label: "Overdue" },
              { value: "week", label: "Next 7 days" },
              { value: "month", label: "Next 30 days" },
              { value: "upcoming", label: "Today onwards" },
            ]}
          />
        </FilterField>
        <FilterField label="Technician" htmlFor="f-tech" className="sm:min-w-52">
          <NativeSelect
            id="f-tech"
            name="technician"
            defaultValue={sp.technician ?? ""}
            placeholder="All technicians"
            options={[{ value: "none", label: "Unassigned" }, ...technicians]}
          />
        </FilterField>
        <FilterField label="Status" htmlFor="f-vstatus">
          <NativeSelect
            id="f-vstatus"
            name="status"
            defaultValue={status}
            options={[
              ...serviceVisitStatuses.map((s) => ({ value: s, label: serviceVisitStatus[s].label })),
              { value: "all", label: "All" },
            ]}
          />
        </FilterField>
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState
          icon={<CalendarClockIcon />}
          title={range === "overdue" ? "Nothing overdue" : "No service visits match"}
          description="Visits are generated when an AMC contract is created or renewed, and when a complaint is assigned."
        />
      ) : (
        <VisitsTable rows={rows} technicians={technicians} today={today} showClient />
      )}
    </>
  );
}
