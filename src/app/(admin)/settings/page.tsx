import { asc } from "drizzle-orm";
import { PencilIcon, PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ActionDialog } from "@/components/app/action-dialog";
import { EmptyState } from "@/components/app/empty-state";
import { LinkTabs } from "@/components/app/link-tabs";
import { PageHeader, SectionTitle } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db";
import { departments, leavePolicies, leaveTypes, officeLocations, shifts } from "@/db/schema";
import { requireRole } from "@/lib/session";
import { formatDuration, minutesToLabel, timeToMinutes } from "@/lib/time";
import { employeeOptions } from "@/server/lookups";

import {
  removePolicyTypeAction,
  toggleDepartmentAction,
  toggleLeaveTypeAction,
  toggleLocationAction,
  togglePolicyAction,
  toggleShiftAction,
} from "./actions";
import { ActiveToggle } from "./active-toggle";
import { FormDialog } from "./form-dialog";
import {
  DepartmentForm,
  LeaveTypeForm,
  LocationForm,
  PolicyForm,
  PolicyTypeForm,
  ShiftForm,
} from "./forms";

export const metadata: Metadata = { title: "Settings" };

type SearchParams = Promise<{ tab?: string }>;

const TABS = ["shifts", "locations", "departments", "leave"] as const;
type Tab = (typeof TABS)[number];

export default async function SettingsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRole(["super_admin"]);
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as Tab) : "shifts";

  return (
    <>
      <PageHeader title="Settings" description="Shifts, office locations, departments and leave policies." />
      <LinkTabs
        active={tab}
        tabs={[
          { key: "shifts", label: "Shifts", href: "/settings" },
          { key: "locations", label: "Office locations", href: "/settings?tab=locations" },
          { key: "departments", label: "Departments", href: "/settings?tab=departments" },
          { key: "leave", label: "Leave types & policies", href: "/settings?tab=leave" },
        ]}
      />
      {tab === "shifts" ? <Shifts /> : null}
      {tab === "locations" ? <Locations /> : null}
      {tab === "departments" ? <Departments /> : null}
      {tab === "leave" ? <Leave /> : null}
    </>
  );
}

/** Table on the left, "add" card on the right (stacked on small screens). */
function TwoColumn({ table, addTitle, addDescription, form }: { table: ReactNode; addTitle: string; addDescription?: string; form: ReactNode }) {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1fr_22rem]">
      <Card className="min-w-0 py-0">{table}</Card>
      <Card>
        <CardHeader>
          <CardTitle>{addTitle}</CardTitle>
          {addDescription ? <CardDescription>{addDescription}</CardDescription> : null}
        </CardHeader>
        <CardContent>{form}</CardContent>
      </Card>
    </div>
  );
}

function EditButton({ label }: { label: string }) {
  return (
    <Button size="icon-sm" variant="ghost" aria-label={label}>
      <PencilIcon />
    </Button>
  );
}

const hm = (t: string | null) => (t ? minutesToLabel(timeToMinutes(t)) : "—");
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ── Shifts ───────────────────────────────────────────────────

async function Shifts() {
  const rows = await db.select().from(shifts).orderBy(asc(shifts.name));
  return (
    <TwoColumn
      addTitle="Add a shift"
      addDescription="Rules decide whether a check-in is on time, late or a half-day."
      form={<ShiftForm />}
      table={
        rows.length === 0 ? (
          <div className="p-6"><EmptyState title="No shifts yet" description="Staff without a shift use 9:30 AM–6:30 PM." /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Shift</TableHead>
                <TableHead className="hidden md:table-cell">Grace / break</TableHead>
                <TableHead className="hidden xl:table-cell">Half-day / absent</TableHead>
                <TableHead className="hidden lg:table-cell">Overtime</TableHead>
                <TableHead>Weekly off</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right"><span className="sr-only">Edit</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      {hm(s.startTime)} – {hm(s.endTime)}
                      {s.crossesMidnight ? " (night)" : ""}
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-sm md:table-cell">
                    {s.graceMinutes}m grace · {formatDuration(s.breakMinutes)} break
                    <div className="text-xs text-muted-foreground">
                      {s.latesPerHalfDay ? `${s.latesPerHalfDay} lates = ½ day` : "No late cut"}
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-sm xl:table-cell">
                    {s.halfDayAfter ? `In after ${hm(s.halfDayAfter)}` : "No late half-day"}
                    <div className="text-xs text-muted-foreground">
                      &lt;{formatDuration(s.halfDayBelowMinutes)} = ½ · &lt;{formatDuration(s.absentBelowMinutes)} = absent
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-sm lg:table-cell">after +{s.overtimeAfterMinutes}m</TableCell>
                  <TableCell className="text-sm">{s.weeklyOffs.length ? s.weeklyOffs.map((d) => WEEKDAYS[d]).join(", ") : "None"}</TableCell>
                  <TableCell>
                    <ActiveToggle action={toggleShiftAction} id={s.id} active={s.isActive} label={`${s.name} active`} />
                  </TableCell>
                  <TableCell className="text-right">
                    <FormDialog title={`Edit ${s.name}`} trigger={<EditButton label={`Edit ${s.name}`} />}>
                      <ShiftForm
                        initial={{
                          id: s.id,
                          name: s.name,
                          startTime: s.startTime,
                          endTime: s.endTime,
                          crossesMidnight: s.crossesMidnight,
                          breakMinutes: s.breakMinutes,
                          graceMinutes: s.graceMinutes,
                          halfDayAfter: s.halfDayAfter,
                          halfDayBelowMinutes: s.halfDayBelowMinutes,
                          absentBelowMinutes: s.absentBelowMinutes,
                          overtimeAfterMinutes: s.overtimeAfterMinutes,
                          latesPerHalfDay: s.latesPerHalfDay,
                          weeklyOffs: s.weeklyOffs,
                        }}
                      />
                    </FormDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )
      }
    />
  );
}

// ── Office locations ─────────────────────────────────────────

async function Locations() {
  const rows = await db.select().from(officeLocations).orderBy(asc(officeLocations.name));
  return (
    <TwoColumn
      addTitle="Add an office location"
      addDescription="Office staff check in within the radius of an allowed location."
      form={<LocationForm />}
      table={
        rows.length === 0 ? (
          <div className="p-6"><EmptyState title="No office locations yet" /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Location</TableHead>
                <TableHead className="hidden md:table-cell">Coordinates</TableHead>
                <TableHead className="text-right">Radius</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right"><span className="sr-only">Edit</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <div className="font-medium">{l.name}</div>
                    {l.address ? <div className="max-w-64 truncate text-xs text-muted-foreground" title={l.address}>{l.address}</div> : null}
                  </TableCell>
                  <TableCell className="hidden font-mono text-xs md:table-cell">
                    <a
                      href={`https://www.openstreetmap.org/?mlat=${l.lat}&mlon=${l.lng}#map=17/${l.lat}/${l.lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-primary hover:underline"
                    >
                      {Number(l.lat).toFixed(5)}, {Number(l.lng).toFixed(5)}
                    </a>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{l.radiusM} m</TableCell>
                  <TableCell>
                    <ActiveToggle action={toggleLocationAction} id={l.id} active={l.isActive} label={`${l.name} active`} />
                  </TableCell>
                  <TableCell className="text-right">
                    <FormDialog title={`Edit ${l.name}`} trigger={<EditButton label={`Edit ${l.name}`} />}>
                      <LocationForm initial={{ id: l.id, name: l.name, address: l.address, lat: Number(l.lat), lng: Number(l.lng), radiusM: l.radiusM }} />
                    </FormDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )
      }
    />
  );
}

// ── Departments ──────────────────────────────────────────────

async function Departments() {
  const [rows, empOpts] = await Promise.all([
    db.query.departments.findMany({
      orderBy: [asc(departments.name)],
      with: { head: { columns: { name: true } } },
    }),
    employeeOptions(),
  ]);
  return (
    <TwoColumn
      addTitle="Add a department"
      form={<DepartmentForm employees={empOpts} />}
      table={
        rows.length === 0 ? (
          <div className="p-6"><EmptyState title="No departments yet" /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Department</TableHead>
                <TableHead>Head</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right"><span className="sr-only">Edit</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell className="text-muted-foreground">{d.head?.name ?? "—"}</TableCell>
                  <TableCell>
                    <ActiveToggle action={toggleDepartmentAction} id={d.id} active={d.isActive} label={`${d.name} active`} />
                  </TableCell>
                  <TableCell className="text-right">
                    <FormDialog title={`Edit ${d.name}`} trigger={<EditButton label={`Edit ${d.name}`} />}>
                      <DepartmentForm initial={{ id: d.id, name: d.name, headEmployeeId: d.headEmployeeId }} employees={empOpts} />
                    </FormDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )
      }
    />
  );
}

// ── Leave types & policies ───────────────────────────────────

const accrualLabel: Record<string, string> = { yearly: "Yearly", monthly: "Monthly", none: "None" };

async function Leave() {
  const [types, policies] = await Promise.all([
    db.select().from(leaveTypes).orderBy(asc(leaveTypes.code)),
    db.query.leavePolicies.findMany({
      orderBy: [asc(leavePolicies.name)],
      with: { types: { with: { leaveType: { columns: { code: true, name: true } } } } },
    }),
  ]);
  const typeOpts = types.filter((t) => t.isActive).map((t) => ({ value: String(t.id), label: `${t.name} (${t.code})` }));

  return (
    <>
      <SectionTitle>Leave types</SectionTitle>
      <TwoColumn
        addTitle="Add a leave type"
        form={<LeaveTypeForm />}
        table={
          types.length === 0 ? (
            <div className="p-6"><EmptyState title="No leave types yet" description="Add CL, SL, PL and so on." /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right"><span className="sr-only">Edit</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {types.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono font-medium">{t.code}</TableCell>
                    <TableCell>{t.name}</TableCell>
                    <TableCell>
                      <StatusBadge label={t.isPaid ? "Paid" : "Unpaid"} tone={t.isPaid ? "success" : "neutral"} />
                    </TableCell>
                    <TableCell>
                      <ActiveToggle action={toggleLeaveTypeAction} id={t.id} active={t.isActive} label={`${t.name} active`} />
                    </TableCell>
                    <TableCell className="text-right">
                      <FormDialog title={`Edit ${t.name}`} trigger={<EditButton label={`Edit ${t.name}`} />}>
                        <LeaveTypeForm initial={{ id: t.id, code: t.code, name: t.name, isPaid: t.isPaid }} />
                      </FormDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )
        }
      />

      <SectionTitle>Leave policies</SectionTitle>
      <div className="grid items-start gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          {policies.length === 0 ? (
            <EmptyState title="No leave policies yet" description="A policy sets each leave type's quota. Every employee is attached to one." />
          ) : null}
          {policies.map((p) => {
            const usedTypeIds = new Set(p.types.map((t) => t.leaveTypeId));
            const addable = typeOpts.filter((o) => !usedTypeIds.has(Number(o.value)));
            return (
              <Card key={p.id} className="gap-0 py-0">
                <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
                  <h3 className="font-semibold">{p.name}</h3>
                  <FormDialog title="Rename policy" trigger={<EditButton label={`Rename ${p.name}`} />}>
                    <PolicyForm initial={{ id: p.id, name: p.name }} />
                  </FormDialog>
                  <div className="ml-auto flex items-center gap-3">
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      Active
                      <ActiveToggle action={togglePolicyAction} id={p.id} active={p.isActive} label={`${p.name} active`} />
                    </span>
                    {addable.length ? (
                      <FormDialog
                        title={`Set a quota in ${p.name}`}
                        description="Adds the leave type to this policy with these rules."
                        trigger={
                          <Button size="sm" variant="outline">
                            <PlusIcon /> Set quota
                          </Button>
                        }
                      >
                        <PolicyTypeForm policyId={p.id} leaveTypes={addable} />
                      </FormDialog>
                    ) : null}
                  </div>
                </div>
                {p.types.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-muted-foreground">No leave types in this policy yet. Use “Set quota”.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Quota</TableHead>
                        <TableHead className="hidden sm:table-cell">Accrual</TableHead>
                        <TableHead className="hidden text-right md:table-cell">Carry fwd</TableHead>
                        <TableHead className="hidden text-right md:table-cell">Notice</TableHead>
                        <TableHead className="hidden text-right lg:table-cell">Max cont.</TableHead>
                        <TableHead className="text-right"><span className="sr-only">Actions</span></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {p.types.map((pt) => (
                        <TableRow key={pt.leaveTypeId}>
                          <TableCell>
                            <span className="font-mono font-medium">{pt.leaveType.code}</span>
                            <span className="hidden text-muted-foreground sm:inline"> · {pt.leaveType.name}</span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{pt.yearlyQuota}</TableCell>
                          <TableCell className="hidden sm:table-cell">{accrualLabel[pt.accrual] ?? pt.accrual}</TableCell>
                          <TableCell className="hidden text-right tabular-nums md:table-cell">{pt.carryForwardMax}</TableCell>
                          <TableCell className="hidden text-right tabular-nums md:table-cell">{pt.minNoticeDays}d</TableCell>
                          <TableCell className="hidden text-right tabular-nums lg:table-cell">{pt.maxContinuousDays ?? "—"}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <FormDialog title={`${pt.leaveType.name} in ${p.name}`} trigger={<EditButton label={`Edit ${pt.leaveType.code} rules`} />}>
                                <PolicyTypeForm
                                  policyId={p.id}
                                  leaveTypes={[]}
                                  initial={{
                                    leaveTypeId: pt.leaveTypeId,
                                    yearlyQuota: pt.yearlyQuota,
                                    accrual: pt.accrual,
                                    carryForwardMax: pt.carryForwardMax,
                                    minNoticeDays: pt.minNoticeDays,
                                    maxContinuousDays: pt.maxContinuousDays,
                                    documentAfterDays: pt.documentAfterDays,
                                    expiresAfterDays: pt.expiresAfterDays,
                                  }}
                                />
                              </FormDialog>
                              <ActionDialog
                                action={removePolicyTypeAction}
                                hidden={{ policyId: p.id, leaveTypeId: pt.leaveTypeId }}
                                title={`Remove ${pt.leaveType.code} from ${p.name}?`}
                                description="Existing balances stay. New yearly credits for this type stop for staff on this policy."
                                confirmLabel="Remove"
                                destructive
                                trigger={<Button size="sm" variant="ghost">Remove</Button>}
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Card>
            );
          })}
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Add a policy</CardTitle>
            <CardDescription>Then set a quota for each leave type it includes.</CardDescription>
          </CardHeader>
          <CardContent>
            <PolicyForm />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
