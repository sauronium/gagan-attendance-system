"use client";

import { useActionState, useCallback, useRef, useState } from "react";

import { FormError, FormField, SubmitButton, useActionToast } from "@/components/app/form-bits";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { initialActionState } from "@/lib/action";

import { updateTemplateAction } from "./actions";

export type TemplateForEdit = {
  id: number;
  key: string;
  name: string;
  body: string;
  variables: string[];
  offsetDays: number[] | null;
  isActive: boolean;
};

/** Super-admin editor for one SMS template. */
export function TemplateDialog({ template }: { template: TemplateForEdit }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const [state, action] = useActionState(updateTemplateAction, initialActionState);
  useActionToast(state, close);
  const fe = state.fieldErrors ?? {};

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Edit</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {open ? (
          <form action={action} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Edit template</DialogTitle>
              <DialogDescription>
                Key <code className="font-mono">{template.key}</code>. Placeholders in {"{{double braces}}"} are filled in when sending.
              </DialogDescription>
            </DialogHeader>
            <input type="hidden" name="id" value={template.id} />
            <FormField label="Name" htmlFor="t-name" error={fe.name} required>
              <Input id="t-name" name="name" defaultValue={template.name} maxLength={100} required />
            </FormField>
            <BodyEditor defaultValue={template.body} variables={template.variables} error={fe.body} />
            <FormField
              label="Send days before the event"
              htmlFor="t-offsets"
              error={fe.offsetDays}
              hint="Comma-separated, e.g. 7,3. Leave blank to use the built-in timing."
            >
              <Input
                id="t-offsets"
                name="offsetDays"
                defaultValue={template.offsetDays?.join(",") ?? ""}
                inputMode="numeric"
                placeholder="7,3"
              />
            </FormField>
            <div className="flex items-center gap-2">
              <Switch id="t-active" name="isActive" defaultChecked={template.isActive} />
              <Label htmlFor="t-active" className="font-normal">Active (sends automatically)</Label>
            </div>
            <FormError state={state} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>Cancel</Button>
              <SubmitButton>Save template</SubmitButton>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** Body textarea with clickable chips that insert {{variable}} at the cursor. */
function BodyEditor({
  defaultValue,
  variables,
  error,
}: {
  defaultValue: string;
  variables: string[];
  error?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(defaultValue);
  const chips = variables.length ? variables : ["client", "contact"];

  function insert(name: string) {
    const el = ref.current;
    const token = `{{${name}}}`;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    setValue(next);
    // Put the caret after the inserted token once React has re-rendered.
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  return (
    <FormField
      label="Message"
      htmlFor="t-body"
      error={error}
      hint={`${value.length} characters · ${Math.max(1, Math.ceil(value.length / 160))} SMS part(s)`}
      required
    >
      <Textarea
        ref={ref}
        id="t-body"
        name="body"
        rows={5}
        maxLength={640}
        required
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <div className="flex flex-wrap gap-1.5" aria-label="Insert a variable">
        {chips.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => insert(v)}
            className="rounded-full border bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
          >
            {`{{${v}}}`}
          </button>
        ))}
      </div>
    </FormField>
  );
}
