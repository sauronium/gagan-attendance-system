import Link from "next/link";

import { ActionDialog } from "@/components/app/action-dialog";
import { badgeFrom } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { renewContractAction } from "@/app/(admin)/amc/actions";
import { contractStatus, labelOf, paymentStatus } from "@/lib/labels";
import { addDays, daysBetween, formatDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { ContractRow } from "@/server/amc";

import { formatInr, planLabel, plantLabel } from "./format";

/** Days left on an active contract, coloured: ≤30 warning, past due danger. */
function ExpiryCell({ endOn, status, today }: { endOn: string; status: string; today: string }) {
  if (status !== "active") return <span className="text-muted-foreground">—</span>;
  const d = daysBetween(today, endOn);
  return (
    <span
      className={cn(
        "whitespace-nowrap tabular-nums",
        d < 0 ? "font-semibold text-destructive" : d <= 30 ? "font-semibold text-warning" : "text-muted-foreground",
      )}
    >
      {d < 0 ? `${-d}d overdue` : d === 0 ? "Today" : `${d}d`}
    </span>
  );
}

function RenewButton({ id, contractNo, endOn }: { id: number; contractNo: string; endOn: string }) {
  return (
    <ActionDialog
      action={renewContractAction}
      hidden={{ id }}
      title={`Renew ${contractNo}?`}
      description={`A new contract starts ${formatDate(addDays(endOn, 1))} with the same plan, length, value and visits per year. Its service visits are scheduled and the client gets an SMS.`}
      confirmLabel="Renew"
      trigger={<Button size="sm" variant="outline">Renew</Button>}
    />
  );
}

export function ContractsTable({
  rows,
  today,
  showClient,
  contractHref,
  selectedId,
}: {
  rows: ContractRow[];
  today: string;
  showClient?: boolean;
  /** Link for the contract number (e.g. to show its service visits). */
  contractHref?: (id: number) => string;
  selectedId?: number;
}) {
  return (
    <Card className="py-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Contract</TableHead>
            {showClient ? <TableHead>Client</TableHead> : null}
            <TableHead className="hidden md:table-cell">Plant</TableHead>
            <TableHead className="hidden sm:table-cell">Period</TableHead>
            <TableHead className="hidden text-right lg:table-cell">Visits / yr</TableHead>
            <TableHead className="hidden md:table-cell">Value / paid</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Expires in</TableHead>
            <TableHead className="text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((k) => {
            const site = k.installation.site;
            return (
              <TableRow key={k.id} data-state={selectedId === k.id ? "selected" : undefined}>
                <TableCell>
                  {contractHref ? (
                    <Link href={contractHref(k.id)} className="font-medium hover:text-primary hover:underline">
                      {k.contractNo}
                    </Link>
                  ) : (
                    <span className="font-medium">{k.contractNo}</span>
                  )}
                  <div className="text-xs text-muted-foreground">{planLabel[k.plan] ?? k.plan}</div>
                </TableCell>
                {showClient ? (
                  <TableCell>
                    <Link href={`/clients/${site.client.id}?tab=amc`} className="hover:text-primary hover:underline">
                      {site.client.name}
                    </Link>
                    <div className="text-xs text-muted-foreground md:hidden">{plantLabel(k.installation)}</div>
                  </TableCell>
                ) : null}
                <TableCell className="hidden md:table-cell">
                  {plantLabel(k.installation)}
                  {k.installation.serialNo ? (
                    <div className="text-xs text-muted-foreground">S/N {k.installation.serialNo}</div>
                  ) : null}
                </TableCell>
                <TableCell className="hidden whitespace-nowrap sm:table-cell">
                  {formatDate(k.startOn)} – {formatDate(k.endOn)}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums lg:table-cell">{k.visitsPerYear}</TableCell>
                <TableCell className="hidden md:table-cell">
                  <div className="tabular-nums">
                    {formatInr(k.value)} <span className="text-muted-foreground">/ {formatInr(k.amountPaid)}</span>
                  </div>
                  {badgeFrom(labelOf(paymentStatus, k.paymentStatus), "mt-1")}
                </TableCell>
                <TableCell>
                  {badgeFrom(labelOf(contractStatus, k.status))}
                  {k.paymentStatus !== "paid" ? (
                    <div className="mt-1 md:hidden">{badgeFrom(labelOf(paymentStatus, k.paymentStatus))}</div>
                  ) : null}
                </TableCell>
                <TableCell className="text-right">
                  <ExpiryCell endOn={k.endOn} status={k.status} today={today} />
                </TableCell>
                <TableCell className="text-right">
                  {k.status === "active" || k.status === "expired" ? (
                    <RenewButton id={k.id} contractNo={k.contractNo} endOn={k.endOn} />
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
