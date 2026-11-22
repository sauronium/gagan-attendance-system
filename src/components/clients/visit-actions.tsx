import { ActionDialog } from "@/components/app/action-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { markVisitDoneAction, markVisitMissedAction, rescheduleVisitAction } from "@/app/(admin)/amc/actions";
import { formatDate } from "@/lib/time";

/** Done / Missed / Reschedule buttons for one scheduled service visit. */
export function VisitActions({
  visitId,
  dueOn,
  label,
  nextDueOn,
  today,
}: {
  visitId: number;
  dueOn: string;
  /** e.g. client name, shown in dialog titles. */
  label: string;
  /** Suggested next due date for the Done dialog. */
  nextDueOn?: string | null;
  today: string;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      <ActionDialog
        action={markVisitDoneAction}
        hidden={{ id: visitId }}
        title={`Mark visit done · ${label}`}
        description={`Due ${formatDate(dueOn)}. The client gets a "service completed" SMS.`}
        confirmLabel="Mark done"
        trigger={<Button size="sm">Done</Button>}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`done-notes-${visitId}`}>Notes</Label>
          <Textarea id={`done-notes-${visitId}`} name="notes" rows={3} maxLength={2000} placeholder="Work done, parts replaced, readings…" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`done-next-${visitId}`}>Next due date</Label>
          <Input id={`done-next-${visitId}`} name="nextDueOn" type="date" defaultValue={nextDueOn ?? ""} />
          <p className="text-xs text-muted-foreground">Leave blank to use the contract&apos;s next scheduled visit.</p>
        </div>
      </ActionDialog>
      <ActionDialog
        action={markVisitMissedAction}
        hidden={{ id: visitId }}
        title={`Mark visit missed · ${label}`}
        description={`Due ${formatDate(dueOn)}.`}
        confirmLabel="Mark missed"
        destructive
        trigger={<Button size="sm" variant="outline">Missed</Button>}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`missed-remark-${visitId}`}>Reason (optional)</Label>
          <Textarea id={`missed-remark-${visitId}`} name="remark" rows={2} maxLength={2000} placeholder="Client unavailable, site closed…" />
        </div>
      </ActionDialog>
      <ActionDialog
        action={rescheduleVisitAction}
        hidden={{ id: visitId }}
        title={`Reschedule visit · ${label}`}
        description={`Currently due ${formatDate(dueOn)}. A new visit is created with the same technician.`}
        confirmLabel="Reschedule"
        trigger={<Button size="sm" variant="ghost">Reschedule</Button>}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`resched-date-${visitId}`}>
            New date<span className="text-destructive" aria-hidden> *</span>
          </Label>
          <Input id={`resched-date-${visitId}`} name="newDate" type="date" required min={today} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`resched-remark-${visitId}`}>Reason (optional)</Label>
          <Textarea id={`resched-remark-${visitId}`} name="remark" rows={2} maxLength={2000} />
        </div>
      </ActionDialog>
    </div>
  );
}
