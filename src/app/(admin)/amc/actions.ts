"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { amcPlans } from "@/db/schema";
import { type ActionState, actionError, formToObject, zf } from "@/lib/action";
import { ADMIN_ROLES } from "@/lib/roles";
import { assertViewer } from "@/lib/session";
import { formatDate } from "@/lib/time";
import {
  assignTechnician,
  cancelContract,
  createContract,
  markServiceVisit,
  recordContractPayment,
  renewContract,
} from "@/server/amc";
import { formatInr } from "@/components/clients/format";

function refresh() {
  revalidatePath("/amc");
  revalidatePath("/clients", "layout");
  revalidatePath("/complaints");
  revalidatePath("/dashboard");
}

const money = () => z.coerce.number({ error: "Enter an amount" }).min(0, "Can't be negative").max(9_999_999_999);
const optDays = () => z.coerce.number().int().min(1).max(3650).optional();

export async function createContractAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(ADMIN_ROLES);
    const d = z
      .object({
        contractNo: zf.optText(30),
        installationId: zf.id(),
        plan: z.enum(amcPlans),
        startOn: zf.date(),
        endOn: zf.date(),
        visitsPerYear: z.coerce.number().int().min(0).max(52),
        filterChangeEveryDays: optDays(),
        membraneChangeEveryDays: optDays(),
        value: money(),
        amountPaid: money().optional(),
        notes: zf.optText(2000),
      })
      .refine((v) => v.endOn >= v.startOn, { message: "End date is before the start date", path: ["endOn"] })
      .refine((v) => (v.amountPaid ?? 0) <= v.value, { message: "More than the contract value", path: ["amountPaid"] })
      .parse(formToObject(fd));
    await createContract(
      {
        contractNo: d.contractNo ?? null,
        installationId: d.installationId,
        plan: d.plan,
        startOn: d.startOn,
        endOn: d.endOn,
        visitsPerYear: d.visitsPerYear,
        filterChangeEveryDays: d.filterChangeEveryDays ?? null,
        membraneChangeEveryDays: d.membraneChangeEveryDays ?? null,
        value: d.value.toFixed(2),
        amountPaid: (d.amountPaid ?? 0).toFixed(2),
        notes: d.notes ?? null,
      },
      viewer.employee.id,
    );
    refresh();
    return { ok: true, message: `Contract created with ${d.visitsPerYear} service visit${d.visitsPerYear === 1 ? "" : "s"} a year.` };
  } catch (e) {
    return actionError(e);
  }
}

export async function renewContractAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(ADMIN_ROLES);
    const id = zf.id().parse(fd.get("id"));
    await renewContract(id, viewer.employee.id);
    refresh();
    return { ok: true, message: "Contract renewed and new service visits scheduled." };
  } catch (e) {
    return actionError(e);
  }
}

export async function recordPaymentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(ADMIN_ROLES);
    const d = z
      .object({ id: zf.id(), amount: money().refine((n) => n > 0, "Enter the amount received"), remark: zf.optText(255) })
      .parse(formToObject(fd));
    const res = await recordContractPayment(d.id, { amount: d.amount, remark: d.remark }, viewer.employee.id);
    refresh();
    return {
      ok: true,
      message: res.due > 0 ? `${formatInr(d.amount)} recorded. ${formatInr(res.due)} still due.` : `${formatInr(d.amount)} recorded. Contract fully paid.`,
    };
  } catch (e) {
    return actionError(e);
  }
}

export async function cancelContractAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(ADMIN_ROLES);
    const d = z.object({ id: zf.id(), remark: zf.text(255) }).parse(formToObject(fd));
    const res = await cancelContract(d.id, d.remark, viewer.employee.id);
    refresh();
    return {
      ok: true,
      message: `Contract cancelled.${res.cancelledVisits ? ` ${res.cancelledVisits} upcoming visit${res.cancelledVisits === 1 ? "" : "s"} cancelled.` : ""}`,
    };
  } catch (e) {
    return actionError(e);
  }
}

export async function assignVisitAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(ADMIN_ROLES);
    const { visitId, technicianId } = z
      .object({ visitId: zf.id(), technicianId: z.coerce.number({ error: "Pick a technician" }).int().positive("Pick a technician") })
      .parse(formToObject(fd));
    const res = await assignTechnician(visitId, technicianId, viewer.employee.id);
    refresh();
    return { ok: true, message: res.changed ? `${res.name} assigned. Client and technician notified.` : `${res.name} is already assigned.` };
  } catch (e) {
    return actionError(e);
  }
}

export async function markVisitDoneAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(ADMIN_ROLES);
    const d = z
      .object({ id: zf.id(), notes: zf.optText(2000), nextDueOn: zf.optDate() })
      .parse(formToObject(fd));
    const res = await markServiceVisit(d.id, "done", { notes: d.notes, nextDueOn: d.nextDueOn }, viewer.employee.id);
    refresh();
    return {
      ok: true,
      message: res.nextDueOn ? `Visit marked done. Next service ${formatDate(res.nextDueOn)}.` : "Visit marked done.",
    };
  } catch (e) {
    return actionError(e);
  }
}

export async function markVisitMissedAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(ADMIN_ROLES);
    const d = z.object({ id: zf.id(), remark: zf.optText(2000) }).parse(formToObject(fd));
    await markServiceVisit(d.id, "missed", { notes: d.remark }, viewer.employee.id);
    refresh();
    return { ok: true, message: "Visit marked missed." };
  } catch (e) {
    return actionError(e);
  }
}

export async function rescheduleVisitAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const viewer = await assertViewer(ADMIN_ROLES);
    const d = z
      .object({ id: zf.id(), newDate: zf.date(), remark: zf.optText(2000) })
      .parse(formToObject(fd));
    await markServiceVisit(d.id, "rescheduled", { notes: d.remark, newDate: d.newDate }, viewer.employee.id);
    refresh();
    return { ok: true, message: `Visit moved to ${formatDate(d.newDate)}.` };
  } catch (e) {
    return actionError(e);
  }
}
