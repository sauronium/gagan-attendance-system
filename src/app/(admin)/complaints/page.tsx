import { and, eq, inArray, isNull, type SQL } from "drizzle-orm";
import { BellRingIcon } from "lucide-react";
import type { Metadata } from "next";

import { ComplaintsTable } from "@/components/clients/complaints-table";
import { NewComplaintDialog } from "@/components/clients/complaint-dialog";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar, FilterField } from "@/components/app/filter-bar";
import { PageHeader } from "@/components/app/page-header";
import { NativeSelect } from "@/components/ui/native-select";
import { type ComplaintPriority, type ComplaintStatus, complaintPriorities, complaints, complaintStatuses } from "@/db/schema";
import { complaintPriority, complaintStatus } from "@/lib/labels";
import { requireAdmin } from "@/lib/session";
import { listComplaints } from "@/server/amc";
import { installationOptions } from "@/server/clients";
import { technicianOptions } from "@/server/lookups";

export const metadata: Metadata = { title: "Complaints" };

type SearchParams = Promise<{ status?: string; priority?: string; technician?: string }>;

const OPEN_STATUSES: ComplaintStatus[] = ["open", "assigned", "in_progress"];

export default async function ComplaintsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const status = sp.status ?? "active";

  const where: SQL[] = [];
  if (status === "active") where.push(inArray(complaints.status, OPEN_STATUSES));
  else if ((complaintStatuses as readonly string[]).includes(status)) {
    where.push(eq(complaints.status, status as ComplaintStatus));
  }
  if (sp.priority && (complaintPriorities as readonly string[]).includes(sp.priority)) {
    where.push(eq(complaints.priority, sp.priority as ComplaintPriority));
  }
  if (sp.technician === "none") where.push(isNull(complaints.assignedTo));
  else if (Number(sp.technician)) where.push(eq(complaints.assignedTo, Number(sp.technician)));

  const [rows, technicians, plants] = await Promise.all([
    listComplaints(where.length ? and(...where) : undefined),
    technicianOptions(),
    installationOptions(),
  ]);

  return (
    <>
      <PageHeader
        title="Complaints"
        description="Breakdowns and service requests. Clients get a ticket number by SMS and an SMS when it's resolved."
        actions={<NewComplaintDialog installations={plants} />}
      />

      <FilterBar clearHref="/complaints">
        <FilterField label="Status" htmlFor="f-status">
          <NativeSelect
            id="f-status"
            name="status"
            defaultValue={status}
            options={[
              { value: "active", label: "Open, assigned, in progress" },
              ...complaintStatuses.map((s) => ({ value: s, label: complaintStatus[s].label })),
              { value: "all", label: "All" },
            ]}
          />
        </FilterField>
        <FilterField label="Priority" htmlFor="f-priority">
          <NativeSelect
            id="f-priority"
            name="priority"
            defaultValue={sp.priority ?? ""}
            placeholder="All priorities"
            options={complaintPriorities.map((p) => ({ value: p, label: complaintPriority[p].label }))}
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
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState
          icon={<BellRingIcon />}
          title={status === "active" ? "No open complaints" : "No complaints match"}
          description="Log a complaint against a client's plant to assign a technician and keep the client informed."
        />
      ) : (
        <ComplaintsTable rows={rows} technicians={technicians} showClient />
      )}
    </>
  );
}
