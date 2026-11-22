"use client";

import {
  CalendarDaysIcon,
  CalendarOffIcon,
  HomeIcon,
  MapPinIcon,
  WrenchIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/** Bottom tab bar for the mobile staff app. */
export function StaffNav({ showVisits, showJobs }: { showVisits: boolean; showJobs: boolean }) {
  const pathname = usePathname();
  const items = [
    { href: "/me", label: "Home", icon: HomeIcon, exact: true },
    { href: "/me/leave", label: "Leave", icon: CalendarOffIcon },
    ...(showVisits ? [{ href: "/me/visits", label: "Visits", icon: MapPinIcon }] : []),
    ...(showJobs ? [{ href: "/me/jobs", label: "Jobs", icon: WrenchIcon }] : []),
    { href: "/me/history", label: "History", icon: CalendarDaysIcon },
  ];
  return (
    <nav
      aria-label="Staff app"
      data-staff-nav
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] backdrop-blur"
    >
      <ul className="mx-auto flex max-w-lg">
        {items.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <item.icon className={cn("size-5", active && "stroke-[2.4]")} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
