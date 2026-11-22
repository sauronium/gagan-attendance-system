import { AppSidebar } from "@/components/app/app-sidebar";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { env } from "@/lib/env";
import { roleLabels } from "@/lib/roles";
import { requireAdmin } from "@/lib/session";
import { getNavBadges } from "@/server/nav";

// Admin area: Super Admin and Office Admin only. Every page below also
// calls requireAdmin() (or stricter) itself, and every action re-checks.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireAdmin();
  const badges = await getNavBadges();
  const today = new Intl.DateTimeFormat("en-IN", {
    timeZone: env.timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <SidebarProvider>
      <AppSidebar
        name={viewer.employee.name}
        roleLabel={roleLabels[viewer.employee.role]}
        isSuperAdmin={viewer.employee.role === "super_admin"}
        badges={badges}
      />
      <SidebarInset className="min-w-0 bg-background">
        <header className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur sm:px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="mx-1 h-5" />
          <span className="truncate text-sm text-muted-foreground">{today}</span>
        </header>
        <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">{children}</div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
