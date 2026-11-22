import { LayoutDashboardIcon } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { StaffNav } from "@/components/app/staff-nav";
import { SignOutButton } from "@/components/app/sign-out-button";
import { ThemeToggle } from "@/components/app/theme";
import { buttonVariants } from "@/components/ui/button";
import { requireViewer } from "@/lib/session";

// Mobile-first staff app. Every signed-in employee can use it (admins too).
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const { employee, isAdmin } = await requireViewer();
  const showVisits = employee.workType !== "office" || employee.role === "technician";
  const showJobs = employee.role === "technician";

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-20 border-b bg-card/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-lg items-center justify-between gap-2 px-4">
          <Link href="/me" aria-label="Staff app home">
            <Logo variant="mark" height={34} priority />
          </Link>
          <div className="flex items-center gap-1">
            {isAdmin ? (
              <Link href="/dashboard" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                <LayoutDashboardIcon /> Admin
              </Link>
            ) : null}
            <ThemeToggle />
            <SignOutButton label="" className="size-8 justify-center px-0" />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pt-4 pb-24">{children}</main>
      <StaffNav showVisits={showVisits} showJobs={showJobs} />
    </div>
  );
}
