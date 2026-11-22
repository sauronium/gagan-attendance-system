import Link from "next/link";

import { badgeFrom } from "@/components/app/status-badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { env } from "@/lib/env";
import { complaintPriority, complaintStatus, labelOf } from "@/lib/labels";
import { formatDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { ComplaintRow } from "@/server/amc";

import { ComplaintActions } from "./complaint-actions";
import { ageLabel, plantLabel } from "./format";

type Option = { value: string; label: string };

export function ComplaintsTable({
  rows,
  technicians,
  showClient,
}: {
  rows: ComplaintRow[];
  technicians: Option[];
  showClient?: boolean;
}) {
  const now = new Date();
  return (
    <Card className="py-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ticket</TableHead>
            {showClient ? <TableHead>Client</TableHead> : null}
            <TableHead className="hidden lg:table-cell">Plant</TableHead>
            <TableHead className="hidden md:table-cell">Issue</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden md:table-cell">Assigned to</TableHead>
            <TableHead className="hidden sm:table-cell">Due by</TableHead>
            <TableHead className="hidden text-right sm:table-cell">Age</TableHead>
            <TableHead className="text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((c) => {
            const open = c.status === "open" || c.status === "assigned" || c.status === "in_progress";
            const overdue = open && c.dueBy != null && c.dueBy.getTime() < now.getTime();
            const area = c.installation.site.area || c.installation.site.city;
            return (
              <TableRow key={c.id}>
                <TableCell className="whitespace-nowrap">
                  <span className="font-medium tabular-nums">{c.ticketNo}</span>
                  <div className="max-w-40 truncate text-xs text-muted-foreground md:hidden" title={c.issue}>
                    {c.issue}
                  </div>
                </TableCell>
                {showClient ? (
                  <TableCell>
                    <Link href={`/clients/${c.client.id}?tab=complaints`} className="font-medium hover:text-primary hover:underline">
                      {c.client.name}
                    </Link>
                    {area ? <div className="text-xs text-muted-foreground">{area}</div> : null}
                  </TableCell>
                ) : null}
                <TableCell className="hidden lg:table-cell">{plantLabel(c.installation)}</TableCell>
                <TableCell className="hidden max-w-64 truncate md:table-cell" title={c.issue}>
                  {c.issue}
                </TableCell>
                <TableCell>{badgeFrom(labelOf(complaintPriority, c.priority))}</TableCell>
                <TableCell>
                  {badgeFrom(labelOf(complaintStatus, c.status))}
                  {c.resolutionNotes ? (
                    <div className="mt-1 max-w-48 truncate text-xs text-muted-foreground" title={c.resolutionNotes}>
                      {c.resolutionNotes}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {c.assignee?.name ?? <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className={cn("hidden whitespace-nowrap sm:table-cell", overdue && "font-semibold text-destructive")}>
                  {formatDateTime(c.dueBy, env.timezone)}
                  {overdue ? <div className="text-xs font-normal">Overdue</div> : null}
                </TableCell>
                <TableCell className="hidden text-right text-muted-foreground tabular-nums sm:table-cell">
                  {ageLabel(c.createdAt, open ? now : (c.resolvedAt ?? c.closedAt ?? now))}
                </TableCell>
                <TableCell className="text-right">
                  <ComplaintActions
                    id={c.id}
                    ticketNo={c.ticketNo}
                    status={c.status}
                    assignedTo={c.assignedTo}
                    technicians={technicians}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}
