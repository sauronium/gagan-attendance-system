"use client";

import { type ReactElement, type ReactNode, useActionState, useCallback, useState } from "react";

import { FormError, SubmitButton, useActionToast, useToastedAction } from "@/components/app/form-bits";
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
import { type ActionState, initialActionState } from "@/lib/action";
import { cn } from "@/lib/utils";

type ServerAction = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/**
 * Dialog with a full form posting to a server action. Fields are rendered by
 * `children(state)` so they can show per-field errors. Closes on success.
 */
export function FormDialog({
  action,
  trigger,
  title,
  description,
  submitLabel,
  pendingLabel,
  hidden,
  className,
  children,
}: {
  action: ServerAction;
  trigger: ReactElement;
  title: string;
  description?: ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  hidden?: Record<string, string | number>;
  className?: string;
  children: (state: ActionState) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(useToastedAction(action), initialActionState);
  const close = useCallback(() => setOpen(false), []);
  useActionToast(state, close, { silent: true });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className={cn("max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg", className)}>
        <form action={formAction} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          {hidden
            ? Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={String(v)} />)
            : null}
          {children(state)}
          <FormError state={state} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <SubmitButton pendingLabel={pendingLabel}>{submitLabel}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
