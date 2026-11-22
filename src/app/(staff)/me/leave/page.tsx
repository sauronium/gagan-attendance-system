import { desc, eq } from "drizzle-orm";
import { CalendarOffIcon } from "lucide-react";
import type { Metadata } from "next";

import { ActionDialog } from "@/components/app/action-dialog";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader, SectionTitle } from "@/components/app/page-header";
import { badgeFrom } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db";
import { leaveRequests } from "@/db/schema";
import { env } from "@/lib/env";
import { labelOf, requestStatus } from "@/lib/labels";
import { requireViewer } from "@/lib/session";
import { formatDate, formatDateTime, todayIso, weekdayShort } from "@/lib/time";
import { cn } from "@/lib/utils";
import { getBalances } from "@/server/leave";
import { leaveTypeOptions } from "@/server/lookups";

import { withdrawLeaveAction } from "./actions";
import { LeaveForm } from "./leave-form";

export const metadata: Metadata = { title: "Leave" };

export default async function MyLeavePage() {
  const viewer = await requireViewer();
  const me = viewer.employee;
  const today = todayIso(env.timezone);

  const [balances, typeOptions, requests] = await Promise.all([
    getBalances(me.id, Number(today.slice(0, 4))),
    leaveTypeOptions(),
    db.query.leaveRequests.findMany({
      where: eq(leaveRequests.employeeId, me.id),
      orderBy: [desc(leaveRequests.createdAt)],
      limit: 30,
      with: {
        leaveType: { columns: { code: true, name: true } },
        approver: { columns: { name: true } },
      },
    }),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Leave" description={`Balances for ${today.slice(0, 4)}`} />

      {balances.length ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {balances.map((b) => (
            <div key={b.leaveTypeId} className="rounded-xl border bg-card p-3 shadow-xs">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium" title={b.name}>
                  {b.name}
                </span>
                <span className="text-xs text-muted-foreground">{b.code}</span>
              </div>
              {b.isPaid ? (
                <>
                  <div className={cn("text-2xl font-bold tabular-nums", b.available <= 0 && "text-destructive")}>
                    {b.available}
                  </div>
                  <div className="text-xs text-muted-foreground">left · {b.used} used</div>
                </>
              ) : (
                <>
                  <div className="text-2xl font-bold">—</div>
                  <div className="text-xs text-muted-foreground">unpaid · {b.used} used</div>
                </>
              )}
            </div>
          ))}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Apply for leave</CardTitle>
        </CardHeader>
        <CardContent>
          <LeaveForm typeOptions={typeOptions} today={today} />
        </CardContent>
      </Card>

      <section className="flex flex-col gap-2">
        <SectionTitle>My requests</SectionTitle>
        {requests.length === 0 ? (
          <EmptyState icon={<CalendarOffIcon />} title="No leave requests yet" description="Requests you apply for appear here." />
        ) : (
          <ul className="flex flex-col gap-2">
            {requests.map((r) => (
              <li key={r.id} className="rounded-xl border bg-card p-3 shadow-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {r.leaveType.name}{" "}
                      <span className="text-muted-foreground">
                        · {r.days} day{r.days === 1 ? "" : "s"}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.fromDate === r.toDate
                        ? `${weekdayShort(r.fromDate)}, ${formatDate(r.fromDate)}`
                        : `${formatDate(r.fromDate)} – ${formatDate(r.toDate)}`}
                      {r.halfDay ? ` · ${r.halfDay === "first_half" ? "First half" : "Second half"}` : ""}
                    </p>
                  </div>
                  {badgeFrom(labelOf(requestStatus, r.status))}
                </div>
                {r.reason ? <p className="mt-2 text-sm text-foreground/90">{r.reason}</p> : null}
                {r.decisionRemark ? (
                  <p className="mt-2 rounded-lg bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {r.approver ? `${r.approver.name}: ` : "Remark: "}
                    </span>
                    {r.decisionRemark}
                  </p>
                ) : null}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    Applied {formatDateTime(r.createdAt, env.timezone)}
                  </span>
                  {r.status === "pending" ? (
                    <ActionDialog
                      action={withdrawLeaveAction}
                      hidden={{ id: r.id }}
                      title="Withdraw this leave request?"
                      description={`${r.leaveType.name}, ${formatDate(r.fromDate)}${r.fromDate !== r.toDate ? ` – ${formatDate(r.toDate)}` : ""}`}
                      confirmLabel="Withdraw"
                      destructive
                      trigger={
                        <Button size="sm" variant="outline">
                          Withdraw
                        </Button>
                      }
                    />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
