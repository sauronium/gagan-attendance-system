"use client";

import { Loader2Icon } from "lucide-react";
import { type ComponentProps, type ReactNode, useCallback, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/lib/action";
import { cn } from "@/lib/utils";

/** Submit button that shows a spinner while its form's action runs. */
export function SubmitButton({
  children,
  pendingLabel,
  className,
  ...props
}: ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} className={className} {...props}>
      {pending ? <Loader2Icon className="animate-spin" /> : null}
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}

/** Label + control + error message, laid out vertically. */
export function FormField({
  label,
  htmlFor,
  error,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="text-destructive" aria-hidden> *</span> : null}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/** Inline error banner for a form's top-level error. */
export function FormError({ state }: { state: ActionState }) {
  if (!state.error) return null;
  return (
    <p
      role="alert"
      className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {state.error}
    </p>
  );
}

/**
 * Shows a toast when an action finishes and optionally runs a callback on
 * success (close a dialog, reset a form…).
 */
export function useActionToast(state: ActionState, onSuccess?: () => void, opts?: { silent?: boolean }) {
  const last = useRef<ActionState | null>(null);
  const silent = opts?.silent ?? false;
  useEffect(() => {
    if (state === last.current) return;
    last.current = state;
    if (state.ok) {
      if (state.message && !silent) toast.success(state.message);
      onSuccess?.();
    } else if (state.error && !state.fieldErrors && !silent) {
      toast.error(state.error);
    }
  }, [state, onSuccess, silent]);
}

type ServerAction = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/**
 * Wraps a server action so its toast is shown as soon as the result arrives.
 * Use with `useActionToast(state, onSuccess, { silent: true })` for buttons
 * that disappear after a successful action (Approve, Verify, Mark paid…):
 * the refreshed page unmounts them before an effect could show the toast.
 */
export function useToastedAction(action: ServerAction): ServerAction {
  return useCallback(
    async (prev: ActionState, fd: FormData) => {
      const res = await action(prev, fd);
      if (res.ok) {
        if (res.message) toast.success(res.message);
      } else if (res.error && !res.fieldErrors) {
        toast.error(res.error);
      }
      return res;
    },
    [action],
  );
}
