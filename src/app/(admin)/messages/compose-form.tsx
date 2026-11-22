"use client";

import { useActionState, useRef, useState } from "react";

import { FormError, FormField, SubmitButton, useActionToast } from "@/components/app/form-bits";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { initialActionState } from "@/lib/action";
import { cn } from "@/lib/utils";

import { composeAction } from "./actions";

type Option = { value: string; label: string };

function Choice({
  name,
  value,
  checked,
  onChange,
  label,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: (v: string) => void;
  label: string;
}) {
  const id = `${name}-${value}`;
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
        checked ? "border-primary bg-secondary text-secondary-foreground" : "hover:bg-muted",
      )}
    >
      <input
        id={id}
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        className="accent-primary"
      />
      {label}
    </label>
  );
}

export function ComposeForm({
  templates,
  clients,
  cities,
  segments,
  statuses,
  tzLabel,
}: {
  templates: (Option & { body: string })[];
  clients: Option[];
  cities: Option[];
  segments: Option[];
  statuses: Option[];
  tzLabel: string;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, action] = useActionState(composeAction, initialActionState);
  const [mode, setMode] = useState<"template" | "custom">(templates.length ? "template" : "custom");
  const [audience, setAudience] = useState<"client" | "segment" | "all">("client");
  const [templateId, setTemplateId] = useState("");
  const [text, setText] = useState("");
  useActionToast(state, () => {
    ref.current?.reset();
    setTemplateId("");
    setText("");
  });

  const fe = state.fieldErrors ?? {};
  const preview = templates.find((t) => t.value === templateId)?.body;

  return (
    <form ref={ref} action={action} className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-medium">Message</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <Choice name="mode" value="template" checked={mode === "template"} onChange={(v) => setMode(v as "template")} label="Use a template" />
          <Choice name="mode" value="custom" checked={mode === "custom"} onChange={(v) => setMode(v as "custom")} label="Write a message" />
        </div>
        {mode === "template" ? (
          <FormField label="Template" htmlFor="c-template" error={fe.templateId} required>
            <NativeSelect
              id="c-template"
              name="templateId"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              placeholder="Choose a template…"
              options={templates}
              required
            />
          </FormField>
        ) : (
          <FormField
            label="Message text"
            htmlFor="c-text"
            error={fe.customText}
            hint={`${text.length} characters · ${Math.max(1, Math.ceil(text.length / 160))} SMS part(s). {{client}} and {{contact}} are filled in per recipient.`}
            required
          >
            <Textarea
              id="c-text"
              name="customText"
              rows={4}
              maxLength={640}
              required
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Dear {{client}}, our office is closed on 25 Dec. – Agam Water"
            />
          </FormField>
        )}
        {mode === "template" && preview ? (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground whitespace-pre-line">{preview}</p>
        ) : null}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-medium">Send to</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          <Choice name="audience" value="client" checked={audience === "client"} onChange={(v) => setAudience(v as "client")} label="One client" />
          <Choice name="audience" value="segment" checked={audience === "segment"} onChange={(v) => setAudience(v as "segment")} label="A segment" />
          <Choice name="audience" value="all" checked={audience === "all"} onChange={(v) => setAudience(v as "all")} label="All active clients" />
        </div>
        {audience === "client" ? (
          <FormField label="Client" htmlFor="c-client" error={fe.clientId} required>
            <NativeSelect id="c-client" name="clientId" placeholder="Choose a client…" options={clients} required />
          </FormField>
        ) : null}
        {audience === "segment" ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField label="Segment" htmlFor="c-segment" error={fe.segment}>
              <NativeSelect id="c-segment" name="segment" placeholder="Any segment" options={segments} />
            </FormField>
            <FormField label="City" htmlFor="c-city" error={fe.city}>
              <NativeSelect id="c-city" name="city" placeholder="Any city" options={cities} />
            </FormField>
            <FormField label="Client status" htmlFor="c-status" error={fe.status}>
              <NativeSelect id="c-status" name="status" placeholder="Any status" options={statuses} />
            </FormField>
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Each client gets one SMS, to their primary contact if opted in, otherwise another opted-in contact.
        </p>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          label="Extra variables (optional)"
          htmlFor="c-vars"
          error={fe.vars}
          hint="One per line as name=value, e.g. date=28 Nov. Used for {{name}} placeholders."
        >
          <Textarea id="c-vars" name="vars" rows={3} placeholder={"date=28 Nov\noffer=10% off"} className="font-mono text-xs" />
        </FormField>
        <FormField
          label={`Schedule (optional, ${tzLabel})`}
          htmlFor="c-when"
          error={fe.scheduledAt}
          hint="Leave blank to send now. Times between 8 PM and 9 AM move to the next 9:00 AM."
        >
          <Input id="c-when" name="scheduledAt" type="datetime-local" />
        </FormField>
      </div>

      <FormError state={state} />
      {state.ok && state.message ? (
        <p role="status" className="rounded-lg bg-success-soft px-3 py-2 text-sm text-success">
          {state.message}
        </p>
      ) : null}
      <div className="flex justify-end">
        <SubmitButton size="lg" pendingLabel="Sending…">
          Send messages
        </SubmitButton>
      </div>
    </form>
  );
}
