import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { placeholderEmail } from "@/lib/login-email";

// Admin-side login management. Self sign-up is disabled, so logins are
// created here when an admin adds an employee. Uses Better Auth's internal
// adapter so passwords are hashed exactly as Better Auth expects.

export async function createLogin(input: {
  name: string;
  phone: string;
  email?: string | null;
  empCode: string;
  password: string;
}): Promise<string> {
  const ctx = await auth.$context;
  const email = (input.email || placeholderEmail(input.empCode)).toLowerCase();

  if (await ctx.internalAdapter.findUserByEmail(email)) {
    throw new Error("A login with this email already exists.");
  }
  const clash = await db.query.user.findFirst({
    where: eq(user.phoneNumber, input.phone),
    columns: { id: true },
  });
  if (clash) throw new Error("A login with this mobile number already exists.");

  const created = await ctx.internalAdapter.createUser(
    {
      name: input.name,
      email,
      emailVerified: false,
      phoneNumber: input.phone,
      phoneNumberVerified: true,
    },
    { method: "admin" },
  );
  await ctx.internalAdapter.linkAccount({
    userId: created.id,
    providerId: "credential",
    accountId: created.id,
    password: await ctx.password.hash(input.password),
  });
  return created.id;
}

/** Set a new password and sign the user out everywhere. */
export async function setLoginPassword(userId: string, password: string) {
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");
  const ctx = await auth.$context;
  await ctx.internalAdapter.updatePassword(userId, await ctx.password.hash(password));
  await ctx.internalAdapter.deleteUserSessions(userId);
}

/** Keep the login's name / mobile / email in step with the employee record. */
export async function syncLoginProfile(
  userId: string,
  data: { name: string; phone: string; email?: string | null; empCode: string },
) {
  await db
    .update(user)
    .set({
      name: data.name,
      phoneNumber: data.phone,
      email: (data.email || placeholderEmail(data.empCode)).toLowerCase(),
    })
    .where(eq(user.id, userId));
}

/** Sign the user out of every device (e.g. when deactivated). */
export async function revokeLogin(userId: string) {
  const ctx = await auth.$context;
  await ctx.internalAdapter.deleteUserSessions(userId);
}
