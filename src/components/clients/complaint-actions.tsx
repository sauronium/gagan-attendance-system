import { ActionButton, ActionDialog } from "@/components/app/action-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  assignComplaintAction,
  closeComplaintAction,
  resolveComplaintAction,
  startComplaintAction,
} from "@/app/(admin)/complaints/actions";
import type { ComplaintStatus } from "@/db/schema";

type Option = { value: string; label: string };

/** Assign / In progress / Resolve / Close for one complaint, depending on its status. */
export function ComplaintActions({
  id,
  ticketNo,
  status,
  assignedTo,
  technicians,
}: {
  id: number;
  ticketNo: string;
  status: ComplaintStatus;
  assignedTo: number | null;
  technicians: Option[];
}) {
  if (status === "closed") return null;
  const active = status === "open" || status === "assigned" || status === "in_progress";

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {active ? (
        <ActionDialog
          action={assignComplaintAction}
          hidden={{ id }}
          title={`${assignedTo ? "Reassign" : "Assign"} ${ticketNo}`}
          description="Creates a complaint visit due today. The client and technician both get an SMS."
          confirmLabel="Assign"
          trigger={
            <Button size="sm" variant={assignedTo ? "outline" : "default"}>
              {assignedTo ? "Reassign" : "Assign"}
            </Button>
          }
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`cm-tech-${id}`}>
              Technician<span className="text-destructive" aria-hidden> *</span>
            </Label>
            <NativeSelect
              id={`cm-tech-${id}`}
              name="technicianId"
              required
              defaultValue={assignedTo ? String(assignedTo) : ""}
              placeholder="Pick technician"
              options={technicians}
            />
          </div>
        </ActionDialog>
      ) : null}
      {status === "open" || status === "assigned" ? (
        <ActionButton action={startComplaintAction} hidden={{ id }} variant="outline" pendingLabel="Saving…">
          In progress
        </ActionButton>
      ) : null}
      {active ? (
        <ActionDialog
          action={resolveComplaintAction}
          hidden={{ id }}
          title={`Resolve ${ticketNo}`}
          description="The client gets a resolution SMS."
          confirmLabel="Resolve"
          trigger={<Button size="sm" variant="secondary">Resolve</Button>}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`cm-res-${id}`}>
              Resolution notes<span className="text-destructive" aria-hidden> *</span>
            </Label>
            <Textarea id={`cm-res-${id}`} name="resolutionNotes" rows={3} required maxLength={2000} placeholder="What was fixed or replaced" />
          </div>
        </ActionDialog>
      ) : null}
      <ActionDialog
        action={closeComplaintAction}
        hidden={{ id }}
        title={`Close ${ticketNo}?`}
        description={
          status === "resolved"
            ? "Closes the ticket. No SMS is sent."
            : "Closes the ticket without resolving it (duplicate, withdrawn…). Any pending visit is cancelled."
        }
        confirmLabel="Close ticket"
        destructive={status !== "resolved"}
        trigger={<Button size="sm" variant="ghost">Close</Button>}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`cm-close-${id}`}>Remark (optional)</Label>
          <Textarea id={`cm-close-${id}`} name="remark" rows={2} maxLength={255} />
        </div>
      </ActionDialog>
    </div>
  );
}
