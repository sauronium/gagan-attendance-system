import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Logo } from "@/components/brand/logo";
import { SignOutButton } from "@/components/app/sign-out-button";
import { brand } from "@/lib/brand";
import { homeFor } from "@/lib/roles";
import { getSession, getViewer } from "@/lib/session";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const [{ next }, viewer, session] = await Promise.all([searchParams, getViewer(), getSession()]);
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
  if (viewer) redirect(safeNext ?? homeFor(viewer.employee.role));

  // Signed in, but the login isn't linked to an active employee.
  const orphan = Boolean(session && !viewer);

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-brand-gradient p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="rounded-xl bg-white/95 p-3 self-start">
          <Logo height={40} priority />
        </div>
        <div>
          <h1 className="max-w-md text-4xl font-bold tracking-tight">{brand.appName}</h1>
          <p className="mt-3 max-w-md text-lg opacity-90">
            {brand.tagline}: check in, log visits and keep every client on schedule.
          </p>
        </div>
        <div aria-hidden className="pointer-events-none absolute -right-24 -bottom-24 size-96 rounded-full bg-white/10" />
        <p className="text-xs opacity-70">© {brand.company}</p>
      </div>

      <div className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex justify-center lg:hidden">
            <Logo height={44} priority />
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Sign in</h2>
          <p className="mt-1 mb-6 text-sm text-muted-foreground">
            Use the mobile number and password from your office admin.
          </p>
          {orphan ? (
            <div className="mb-6 flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm text-warning">
              This login isn&apos;t linked to an active employee. Contact your office admin.
              <SignOutButton variant="outline" />
            </div>
          ) : null}
          <LoginForm next={next} />
        </div>
      </div>
    </div>
  );
}
