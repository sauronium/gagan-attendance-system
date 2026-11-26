import { BellRingIcon, FileCheck2Icon, MapPinnedIcon, MessageSquareTextIcon, WrenchIcon } from "lucide-react";
import type { ReactNode } from "react";

import { badgeFrom } from "@/components/app/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { env } from "@/lib/env";
import { complaintStatus, contractStatus, labelOf, serviceVisitStatus, smsStatus, visitStatus } from "@/lib/labels";
import { formatDate, formatDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { TimelineItem, TimelineKind } from "@/server/clients";

const kinds: Record<TimelineKind, { icon: ReactNode; className: string; label: string }> = {
  field_visit: { icon: <MapPinnedIcon />, className: "bg-info-soft text-info", label: "Field visit" },
  service: { icon: <WrenchIcon />, className: "bg-success-soft text-success", label: "Service" },
  complaint: { icon: <BellRingIcon />, className: "bg-destructive/10 text-destructive", label: "Complaint" },
  sms: { icon: <MessageSquareTextIcon />, className: "bg-secondary text-secondary-foreground", label: "SMS" },
  contract: { icon: <FileCheck2Icon />, className: "bg-warning-soft text-warning", label: "Contract" },
};

const maps = {
  fieldVisit: visitStatus,
  service: serviceVisitStatus,
  complaint: complaintStatus,
  sms: smsStatus,
  contract: contractStatus,
};

/** Chronological feed for one client: visits, service, complaints, contracts and SMS. */
export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <Card>
      <CardContent>
        <ol className="relative flex flex-col">
          {items.map((it, idx) => {
            const k = kinds[it.kind];
            return (
              <li key={it.key} className="relative flex gap-3 pb-5 last:pb-0">
                {idx < items.length - 1 ? (
                  <span aria-hidden className="absolute top-8 bottom-0 left-4 w-px -translate-x-1/2 bg-border" />
                ) : null}
                <span
                  className={cn("relative flex size-8 shrink-0 items-center justify-center rounded-full [&_svg]:size-4", k.className)}
                  title={k.label}
                >
                  {k.icon}
                  <span className="sr-only">{k.label}</span>
                </span>
                <div className="min-w-0 flex-1 pt-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium">{it.title}</span>
                    {it.status ? badgeFrom(labelOf(maps[it.status.map], it.status.value)) : null}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {it.dayOnly ? formatDate(it.at, env.timezone) : formatDateTime(it.at, env.timezone)}
                  </div>
                  {it.detail ? <p className="mt-1 line-clamp-3 text-sm break-words text-muted-foreground">{it.detail}</p> : null}
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
