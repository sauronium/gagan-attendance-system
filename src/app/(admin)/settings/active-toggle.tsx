"use client";

import { startTransition, useActionState, useOptimistic } from "react";

import { useActionToast } from "@/components/app/form-bits";
import { Switch } from "@/components/ui/switch";
import { type ActionState, initialActionState } from "@/lib/action";

type ServerAction = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/**
 * On/off switch that posts { id, active } to a server action as soon as it
 * is flipped. Shows the new state immediately and settles on the server's
 * value after revalidation.
 */
export function ActiveToggle({
  action,
  id,
  active,
  label,
  disabled,
}: {
  action: ServerAction;
  id: number;
  active: boolean;
  /** Accessible name, e.g. "General shift active". */
  label: string;
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, initialActionState);
  const [optimistic, setOptimistic] = useOptimistic(active);
  useActionToast(state);

  return (
    <Switch
      checked={optimistic}
      disabled={disabled || pending}
      aria-label={label}
      onCheckedChange={(checked) => {
        const fd = new FormData();
        fd.set("id", String(id));
        fd.set("active", checked ? "true" : "false");
        startTransition(() => {
          setOptimistic(checked);
          formAction(fd);
        });
      }}
    />
  );
}
