"use client";

import {
  BellRingIcon,
  BriefcaseIcon,
  CalendarCheckIcon,
  CalendarOffIcon,
  ClipboardListIcon,
  LayoutDashboardIcon,
  MapPinnedIcon,
  MessageSquareTextIcon,
  SettingsIcon,
  SmartphoneIcon,
  UsersIcon,
  WrenchIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";

import { Logo } from "@/components/brand/logo";
import { SignOutButton } from "@/components/app/sign-out-button";
import { ThemeToggle } from "@/components/app/theme";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType;
  badgeKey?: keyof NavBadges;
  superAdminOnly?: boolean;
};

export type NavBadges = {
  leave?: number;
  visits?: number;
  complaints?: number;
};

const groups: { label: string; items: NavItem[] }[] = [
  {
    label: "Overview",
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboardIcon }],
  },
  {
    label: "People",
    items: [
      { href: "/attendance", label: "Attendance", icon: CalendarCheckIcon },
      { href: "/leave", label: "Leave", icon: CalendarOffIcon, badgeKey: "leave" },
      { href: "/visits", label: "Field visits", icon: MapPinnedIcon, badgeKey: "visits" },
      { href: "/employees", label: "Employees", icon: UsersIcon },
    ],
  },
  {
    label: "Clients",
    items: [
      { href: "/clients", label: "Clients", icon: BriefcaseIcon },
      { href: "/amc", label: "AMC & service", icon: WrenchIcon },
      { href: "/complaints", label: "Complaints", icon: BellRingIcon, badgeKey: "complaints" },
      { href: "/messages", label: "Messages", icon: MessageSquareTextIcon },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/settings", label: "Settings", icon: SettingsIcon, superAdminOnly: true },
      { href: "/audit", label: "Audit log", icon: ClipboardListIcon, superAdminOnly: true },
    ],
  },
];

export function AppSidebar({
  name,
  roleLabel,
  isSuperAdmin,
  badges,
}: {
  name: string;
  roleLabel: string;
  isSuperAdmin: boolean;
  badges: NavBadges;
}) {
  const pathname = usePathname();
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 pt-4 pb-2">
        <Link href="/dashboard" className="flex items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-sidebar-ring">
          <span className="rounded-lg bg-white p-1 group-data-[collapsible=icon]:p-0.5">
            <Logo variant="mark" height={28} className="dark:bg-transparent dark:p-0" />
          </span>
          <span className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-bold text-sidebar-accent-foreground">Agam Ops</span>
            <span className="text-[11px] text-sidebar-foreground/70">Agam Water Industries</span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((g) => {
          const items = g.items.filter((i) => !i.superAdminOnly || isSuperAdmin);
          if (!items.length) return null;
          return (
            <SidebarGroup key={g.label}>
              <SidebarGroupLabel className="text-sidebar-foreground/60">{g.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => {
                    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                    const badge = item.badgeKey ? badges[item.badgeKey] : undefined;
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          isActive={active}
                          tooltip={item.label}
                          render={<Link href={item.href} />}
                          className="data-active:bg-sidebar-accent data-active:font-semibold data-active:text-sidebar-accent-foreground data-active:shadow-[inset_3px_0_0_var(--sidebar-primary)]"
                        >
                          <item.icon />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                        {badge ? (
                          <SidebarMenuBadge className="bg-sidebar-primary text-sidebar-primary-foreground">
                            {badge}
                          </SidebarMenuBadge>
                        ) : null}
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="gap-1 border-t border-sidebar-border p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Staff app" render={<Link href="/me" />}>
              <SmartphoneIcon />
              <span>Open staff app</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="flex items-center gap-2 rounded-lg p-1.5 group-data-[collapsible=icon]:justify-center">
          <Avatar className="size-8">
            <AvatarFallback className="bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 leading-tight group-data-[collapsible=icon]:hidden">
            <div className="truncate text-sm font-medium text-sidebar-accent-foreground">{name}</div>
            <div className="truncate text-xs text-sidebar-foreground/70">{roleLabel}</div>
          </div>
          <ThemeToggle className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:hidden" />
        </div>
        <SignOutButton className="w-full text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:hidden" />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
