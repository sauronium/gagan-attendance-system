import "server-only";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { db } from "@/db";
import { type EmployeeRole, employees } from "@/db/schema";
import { auth } from "@/lib/auth";
import { homeFor, isAdmin } from "@/lib/roles";

type Employee = typeof employees.$inferSelect;

export type Viewer = {
  userId: string;
  employee: Employee;
  isAdmin: boolean;
};

/** Validated Better Auth session for this request (cached per request). */
export const getSession = cache(async () =>
  auth.api.getSession({ headers: await headers() }),
);

/** The signed-in employee, or null if signed out / no linked employee / inactive. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const s = await getSession();
  if (!s) return null;
  const employee = await db.query.employees.findFirst({
    where: eq(employees.userId, s.user.id),
  });
  if (!employee || employee.status === "inactive") return null;
  return { userId: s.user.id, employee, isAdmin: isAdmin(employee.role) };
});

export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  return viewer;
}

/** Redirects to the viewer's own home if their role isn't allowed here. */
export async function requireRole(
  roles: readonly EmployeeRole[],
): Promise<Viewer> {
  const viewer = await requireViewer();
  if (!roles.includes(viewer.employee.role)) {
    redirect(homeFor(viewer.employee.role));
  }
  return viewer;
}

export async function requireAdmin(): Promise<Viewer> {
  return requireRole(["super_admin", "office_admin"]);
}

/** For server actions: throws instead of redirecting. */
export async function assertViewer(
  roles?: readonly EmployeeRole[],
): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) throw new Error("You are signed out. Please sign in again.");
  if (roles && !roles.includes(viewer.employee.role)) {
    throw new Error("You don't have permission to do that.");
  }
  return viewer;
}
