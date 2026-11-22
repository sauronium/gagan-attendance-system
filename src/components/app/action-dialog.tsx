"use client";

import { type ReactElement, type ReactNode, useActionState, useCallback, useState } from "react";

import { FormError, SubmitButton, useActionToast } from "@/components/app/form-bits";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type ActionState, initialActionState } from "@/lib/action";

type ServerAction = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/**
 * Button that opens a confirm dialog and posts to a server action.
 * Use for reject (with a required remark), delete, deactivate…
 * Extra form fields can be passed as children.
 */
export function ActionDialog({
  action,
  trigger,
  title,
  description,
  hidden,
  remark,
  confirmLabel = "Confirm",
  destructive,
  children,
}: {
  action: ServerAction;
  /** Element that opens the dialog, e.g. <Button size="sm">Reject</Button>. */
  trigger: ReactElement;
  title: string;
  description?: ReactNode;
  /** Hidden fields sent with the form (ids…). */
  hidden?: Record<string, string | number>;
  /** Show a remark textarea; "required" makes it mandatory. */
  remark?: "optional" | "required";
  confirmLabel?: string;
  destructive?: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(action, initialActionState);
  const close = useCallback(() => setOpen(false), []);
  useActionToast(state, close);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <form action={formAction} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          {hidden
            ? Object.entries(hidden).map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={String(v)} />
              ))
            : null}
          {children}
          {remark ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="remark">
                Remark{remark === "required" ? <span className="text-destructive"> *</span> : " (optional)"}
              </Label>
              <Textarea
                id="remark"
                name="remark"
                rows={3}
                required={remark === "required"}
                maxLength={255}
                placeholder="Reason shown to the employee"
              />
            </div>
          ) : null}
          <FormError state={state} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <SubmitButton variant={destructive ? "destructive" : "default"}>
              {confirmLabel}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * One-click action button (no dialog), e.g. Approve / Verify.
 * Renders a tiny form so it works with server actions.
 */
export function ActionButton({
  action,
  hidden,
  children,
  variant = "default",
  size = "sm",
  pendingLabel,
}: {
  action: ServerAction;
  hidden: Record<string, string | number>;
  children: ReactNode;
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive";
  size?: "sm" | "default" | "xs";
  pendingLabel?: string;
}) {
  const [state, formAction] = useActionState(action, initialActionState);
  useActionToast(state);
  return (
    <form action={formAction} className="inline-flex">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={String(v)} />
      ))}
      <SubmitButton variant={variant} size={size} pendingLabel={pendingLabel}>
        {children}
      </SubmitButton>
    </form>
  );
}
