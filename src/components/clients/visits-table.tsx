import Link from "next/link";

import { badgeFrom } from "@/components/app/status-badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { env } from "@/lib/env";
import { labelOf, serviceVisitStatus } from "@/lib/labels";
import { formatDate, formatDateTime, weekdayShort } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { ServiceVisitRow } from "@/server/amc";

import { AssignTechForm } from "./assign-form";
import { plantLabel, serviceTypeLabel, siteArea } from "./format";
import { VisitActions } from "./visit-actions";

type Option = { value: string; label: string };

export function VisitsTable({
  rows,
  technicians,
  today,
  showClient,
}: {
  rows: ServiceVisitRow[];
  technicians: Option[];
  today: string;
  showClient?: boolean;
}) {
  return (
    <Card className="py-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Due</TableHead>
            {showClient ? <TableHead>Client</TableHead> : null}
            <TableHead className="hidden md:table-cell">Plant</TableHead>
            <TableHead className="hidden lg:table-cell">Type</TableHead>
            <TableHead className="hidden lg:table-cell">Technician</TableHead>
            <TableHead>Assign</TableHead>
            <TableHead className="hidden sm:table-cell">Status</TableHead>
            <TableHead className="text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((v) => {
            const site = v.installation.site;
            const scheduled = v.status === "scheduled";
            const overdue = scheduled && v.dueOn < today;
            return (
              <TableRow key={v.id}>
                <TableCell className="whitespace-nowrap">
                  <div className={cn("font-medium tabular-nums", overdue && "text-destructive")}>
                    {weekdayShort(v.dueOn)}, {formatDate(v.dueOn)}
                  </div>
                  {overdue ? <div className="text-xs text-destructive">Overdue</div> : null}
                  {v.status === "done" && v.doneAt ? (
                    <div className="text-xs text-muted-foreground">Done {formatDateTime(v.doneAt, env.timezone)}</div>
                  ) : null}
                </TableCell>
                {showClient ? (
                  <TableCell>
                    <Link href={`/clients/${site.client.id}?tab=amc`} className="font-medium hover:text-primary hover:underline">
                      {site.client.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">{siteArea(site) || site.label || "—"}</div>
                  </TableCell>
                ) : null}
                <TableCell className="hidden md:table-cell">{plantLabel(v.installation)}</TableCell>
                <TableCell className="hidden lg:table-cell">
                  {serviceTypeLabel[v.type] ?? v.type}
                  <div className="text-xs text-muted-foreground">{v.contract?.contractNo ?? v.complaint?.ticketNo ?? ""}</div>
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  {v.technician ? v.technician.name : <span className="text-warning">Unassigned</span>}
                </TableCell>
                <TableCell>
                  {scheduled ? (
                    <AssignTechForm visitId={v.id} technicianId={v.technician?.id ?? null} technicians={technicians} />
                  ) : (
                    <span className="text-muted-foreground">{v.technician?.name ?? "—"}</span>
                  )}
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  {badgeFrom(labelOf(serviceVisitStatus, v.status))}
                  {v.status === "done" && v.nextDueOn ? (
                    <div className="mt-1 text-xs text-muted-foreground">Next {formatDate(v.nextDueOn)}</div>
                  ) : null}
                </TableCell>
                <TableCell className="text-right">
                  {scheduled ? (
                    <VisitActions visitId={v.id} dueOn={v.dueOn} label={site.client.name} today={today} />
                  ) : v.notes ? (
                    <span className="block max-w-48 truncate text-xs text-muted-foreground" title={v.notes}>
                      {v.notes}
                    </span>
                  ) : null}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}
