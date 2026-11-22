import { eq } from "drizzle-orm";
import { ArrowLeftIcon, MessageSquareOffIcon, MessagesSquareIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ActionButton } from "@/components/app/action-dialog";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar, FilterField } from "@/components/app/filter-bar";
import { LinkTabs } from "@/components/app/link-tabs";
import { PageHeader } from "@/components/app/page-header";
import { badgeFrom, StatusBadge } from "@/components/app/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db";
import { smsMessages, type SmsStatus, smsStatuses } from "@/db/schema";
import { env } from "@/lib/env";
import { clientSegment, clientStatus, labelOf, smsStatus } from "@/lib/labels";
import { formatPhone, maskPhone } from "@/lib/phone";
import { requireAdmin } from "@/lib/session";
import { formatDateTime, todayIso } from "@/lib/time";
import { cn } from "@/lib/utils";
import { clientOptions, manualTemplateOptions } from "@/server/lookups";
import {
  allTemplates,
  cityOptions,
  CUSTOM_TEMPLATE_KEY,
  getConversations,
  getMessageLog,
  getThread,
} from "@/server/messaging";

import { ActiveToggle } from "../settings/active-toggle";
import { resendAction, toggleTemplateAction } from "./actions";
import { ComposeForm } from "./compose-form";
import { TemplateDialog } from "./template-dialog";

export const metadata: Metadata = { title: "Messages" };

type SearchParams = Promise<{
  tab?: string;
  phone?: string;
  status?: string;
  template?: string;
  from?: string;
  to?: string;
  q?: string;
}>;

const TABS = ["inbox", "log", "compose", "templates"] as const;
type Tab = (typeof TABS)[number];

export default async function MessagesPage({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requireAdmin();
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as Tab) : "inbox";
  const canEditTemplates = viewer.employee.role === "super_admin";

  const failedCount = await db.$count(smsMessages, eq(smsMessages.status, "failed"));

  return (
    <>
      <PageHeader
        title="Messages"
        description="Client SMS: demo inbox, delivery log, manual and scheduled sends, and templates."
      />
      <LinkTabs
        active={tab}
        tabs={[
          { key: "inbox", label: "Inbox", href: "/messages" },
          { key: "log", label: "Log", href: "/messages?tab=log", count: failedCount },
          { key: "compose", label: "Compose", href: "/messages?tab=compose" },
          { key: "templates", label: "Templates", href: "/messages?tab=templates" },
        ]}
      />
      {tab === "inbox" ? <Inbox phone={cleanPhone(sp.phone)} /> : null}
      {tab === "log" ? <Log sp={sp} /> : null}
      {tab === "compose" ? <Compose /> : null}
      {tab === "templates" ? <Templates canEdit={canEditTemplates} /> : null}
    </>
  );
}

/** A raw "+" in a query string arrives as a space; restore it. */
function cleanPhone(p: string | undefined) {
  const v = p?.trim().replace(/^(\d)/, "+$1");
  return v ? v.replace(/\s/g, "") : undefined;
}

const threadHref = (phone: string) => `/messages?phone=${encodeURIComponent(phone)}`;

// ── Inbox ────────────────────────────────────────────────────

async function Inbox({ phone }: { phone?: string }) {
  const tz = env.timezone;
  const [conversations, thread] = await Promise.all([
    getConversations(),
    phone ? getThread(phone) : Promise.resolve([]),
  ]);
  const active = conversations.find((c) => c.phone === phone);
  const threadName = active?.name ?? thread.find((m) => m.client)?.client?.name ?? thread.find((m) => m.employee)?.employee?.name;

  return (
    <>
      <div className="flex items-start gap-3 rounded-xl border border-dashed bg-info-soft px-4 py-3 text-sm text-info">
        <StatusBadge label="DEMO" tone="info" className="mt-0.5 border border-current/30" />
        <p>
          <span className="font-semibold">Demo SMS inbox.</span> Messages are handled by the built-in demo SMS API and
          shown here as the client&apos;s phone would show them. Nothing reaches real phones and nothing is charged.
        </p>
      </div>

      {conversations.length === 0 ? (
        <EmptyState
          icon={<MessagesSquareIcon />}
          title="No messages yet"
          description="Automatic reminders and messages sent from Compose appear here."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
          <Card className={cn("gap-0 py-0", phone && "hidden lg:flex")}>
            <h2 className="border-b px-4 py-3 text-sm font-semibold">Conversations</h2>
            <nav aria-label="Conversations" className="flex max-h-[34rem] flex-col overflow-y-auto">
              {conversations.map((c) => (
                <Link
                  key={c.phone}
                  href={threadHref(c.phone)}
                  aria-current={c.phone === phone ? "page" : undefined}
                  className={cn(
                    "flex flex-col gap-0.5 border-b px-4 py-3 text-sm transition-colors last:border-0 hover:bg-muted",
                    c.phone === phone && "bg-secondary text-secondary-foreground hover:bg-secondary",
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{c.name ?? maskPhone(c.phone)}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(c.lastAt, tz)}</span>
                  </span>
                  {c.name ? <span className="text-xs text-muted-foreground">{maskPhone(c.phone)}</span> : null}
                  <span className={cn("line-clamp-1 text-xs", c.lastStatus === "failed" ? "text-destructive" : "text-muted-foreground")}>
                    {c.lastBody}
                  </span>
                </Link>
              ))}
            </nav>
          </Card>

          <Card className={cn("gap-0 py-0", !phone && "hidden lg:flex")}>
            {phone ? (
              <>
                <div className="flex items-center gap-2 border-b px-4 py-3">
                  <Link href="/messages" className="-ml-1 rounded-md p-1 text-muted-foreground hover:bg-muted lg:hidden" aria-label="Back to conversations">
                    <ArrowLeftIcon className="size-4" />
                  </Link>
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold">{threadName ?? formatPhone(phone)}</h2>
                    <p className="text-xs text-muted-foreground">{formatPhone(phone)} · {thread.length} message{thread.length === 1 ? "" : "s"}</p>
                  </div>
                </div>
                {thread.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">No messages to this number.</p>
                ) : (
                  <ol className="flex max-h-[34rem] flex-col gap-3 overflow-y-auto bg-muted/40 p-4">
                    {thread.map((m) => (
                      <li key={m.id} className="flex max-w-[85%] flex-col gap-1">
                        <div
                          className={cn(
                            "rounded-2xl rounded-bl-sm border bg-card px-3 py-2 text-sm whitespace-pre-line shadow-xs",
                            m.status === "failed" && "border-destructive/40",
                          )}
                        >
                          {m.body}
                        </div>
                        <span className={cn("px-1 text-xs", m.status === "failed" ? "text-destructive" : "text-muted-foreground")}>
                          {formatDateTime(m.sentAt ?? m.scheduledAt, tz)} · {labelOf(smsStatus, m.status).label.toLowerCase()}
                          {m.status === "failed" && m.error ? ` (${m.error})` : ""}
                          {m.attempts > 1 ? ` · ${m.attempts} attempts` : ""}
                          {m.template ? ` · ${m.template.name}` : ""}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </>
            ) : (
              <div className="grid flex-1 place-items-center p-10 text-center text-sm text-muted-foreground">
                Pick a conversation to see its messages.
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  );
}

// ── Log ──────────────────────────────────────────────────────

async function Log({ sp }: { sp: Awaited<SearchParams> }) {
  const tz = env.timezone;
  const status = (smsStatuses as readonly string[]).includes(sp.status ?? "") ? (sp.status as SmsStatus) : undefined;
  const isDate = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const [rows, templates] = await Promise.all([
    getMessageLog(
      { status, templateId: Number(sp.template) || undefined, from: isDate(sp.from), to: isDate(sp.to), phone: sp.q },
      tz,
    ),
    allTemplates(),
  ]);

  return (
    <>
      <FilterBar clearHref="/messages?tab=log">
        <input type="hidden" name="tab" value="log" />
        <FilterField label="Status" htmlFor="l-status">
          <NativeSelect
            id="l-status"
            name="status"
            defaultValue={status ?? ""}
            placeholder="All statuses"
            options={smsStatuses.map((s) => ({ value: s, label: labelOf(smsStatus, s).label }))}
          />
        </FilterField>
        <FilterField label="Template" htmlFor="l-template" className="sm:min-w-48">
          <NativeSelect
            id="l-template"
            name="template"
            defaultValue={sp.template ?? ""}
            placeholder="All templates"
            options={templates.map((t) => ({ value: String(t.id), label: t.name }))}
          />
        </FilterField>
        <FilterField label="From" htmlFor="l-from">
          <Input id="l-from" name="from" type="date" defaultValue={isDate(sp.from) ?? ""} max={todayIso(tz)} />
        </FilterField>
        <FilterField label="To" htmlFor="l-to">
          <Input id="l-to" name="to" type="date" defaultValue={isDate(sp.to) ?? ""} />
        </FilterField>
        <FilterField label="Phone" htmlFor="l-phone">
          <Input id="l-phone" name="q" type="search" inputMode="tel" defaultValue={sp.q ?? ""} placeholder="98123…" />
        </FilterField>
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState icon={<MessageSquareOffIcon />} title="No messages match" description="Try a wider date range or clear the filters." />
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead className="hidden md:table-cell">Template</TableHead>
                <TableHead className="hidden lg:table-cell">Message</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Tries</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDateTime(m.createdAt, tz)}
                    {m.status === "queued" ? (
                      <div className="text-xs">due {formatDateTime(m.scheduledAt, tz)}</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Link href={threadHref(m.phone)} className="hover:text-primary hover:underline">
                      {formatPhone(m.phone)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {m.employee ? (
                      <>
                        <div className="font-medium">{m.employee.name}</div>
                        <div className="text-xs text-muted-foreground">Employee</div>
                      </>
                    ) : m.client ? (
                      <>
                        <div className="font-medium">{m.client.name}</div>
                        {m.contact ? <div className="text-xs text-muted-foreground">{m.contact.name}</div> : null}
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{m.template?.name ?? "—"}</TableCell>
                  <TableCell className="hidden max-w-72 truncate lg:table-cell" title={m.body}>
                    {m.body}
                    {m.status === "failed" && m.error ? (
                      <div className="truncate text-xs text-destructive" title={m.error}>{m.error}</div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <StatusBadge label={m.provider === "live" ? "Live" : "Demo"} tone={m.provider === "live" ? "brand" : "info"} />
                  </TableCell>
                  <TableCell>{badgeFrom(labelOf(smsStatus, m.status))}</TableCell>
                  <TableCell className="text-right tabular-nums">{m.attempts}</TableCell>
                  <TableCell className="text-right">
                    {m.status === "failed" ? (
                      <ActionButton action={resendAction} hidden={{ id: m.id }} variant="outline" pendingLabel="Sending…">
                        Resend
                      </ActionButton>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <p className="text-xs text-muted-foreground">Showing the latest 200 messages that match.</p>
    </>
  );
}

// ── Compose ──────────────────────────────────────────────────

async function Compose() {
  const [templateOpts, templates, clients, cities] = await Promise.all([
    manualTemplateOptions(),
    allTemplates(),
    clientOptions(),
    cityOptions(),
  ]);
  const bodies = new Map(templates.map((t) => [String(t.id), t.body]));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Compose a message</CardTitle>
        <CardDescription>
          Send to one client, a segment or every active client, now or at a set time. Only contacts who opted in to
          SMS receive it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ComposeForm
          templates={templateOpts.map((o) => ({ ...o, body: bodies.get(o.value) ?? "" }))}
          clients={clients}
          cities={cities}
          segments={Object.entries(clientSegment).map(([value, label]) => ({ value, label }))}
          statuses={Object.entries(clientStatus).map(([value, l]) => ({ value, label: l.label }))}
          tzLabel={env.timezone === "Asia/Kolkata" ? "IST" : env.timezone}
        />
      </CardContent>
    </Card>
  );
}

// ── Templates ────────────────────────────────────────────────

const audienceLabel: Record<string, string> = {
  client: "Client",
  technician: "Technician",
  client_and_technician: "Client + technician",
};

const humanize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");

async function Templates({ canEdit }: { canEdit: boolean }) {
  const templates = (await allTemplates()).filter((t) => t.key !== CUSTOM_TEMPLATE_KEY);

  return (
    <>
      {!canEdit ? (
        <p className="text-sm text-muted-foreground">Only a Super Admin can change templates and automation rules.</p>
      ) : null}
      {templates.length === 0 ? (
        <EmptyState title="No templates yet" description="Templates are created by the database seed script." />
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Template</TableHead>
                <TableHead className="hidden lg:table-cell">Message</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead className="hidden sm:table-cell">Days before</TableHead>
                <TableHead className="hidden md:table-cell">Audience</TableHead>
                <TableHead>Active</TableHead>
                {canEdit ? (
                  <TableHead className="text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <div className="font-medium">{t.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">{t.key}</div>
                  </TableCell>
                  <TableCell className="hidden max-w-80 truncate text-muted-foreground lg:table-cell" title={t.body}>
                    {t.body}
                  </TableCell>
                  <TableCell>{t.trigger === "manual" ? <StatusBadge label="Manual" /> : humanize(t.trigger)}</TableCell>
                  <TableCell className="hidden tabular-nums sm:table-cell">{t.offsetDays?.length ? t.offsetDays.join(", ") : "—"}</TableCell>
                  <TableCell className="hidden md:table-cell">{audienceLabel[t.audience] ?? t.audience}</TableCell>
                  <TableCell>
                    {canEdit ? (
                      <ActiveToggle action={toggleTemplateAction} id={t.id} active={t.isActive} label={`${t.name} active`} />
                    ) : (
                      <StatusBadge label={t.isActive ? "On" : "Off"} tone={t.isActive ? "success" : "neutral"} />
                    )}
                  </TableCell>
                  {canEdit ? (
                    <TableCell className="text-right">
                      <TemplateDialog
                        template={{
                          id: t.id,
                          key: t.key,
                          name: t.name,
                          body: t.body,
                          variables: t.variables ?? [],
                          offsetDays: t.offsetDays ?? null,
                          isActive: t.isActive,
                        }}
                      />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
