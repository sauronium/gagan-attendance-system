"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { ThemeProvider as NextThemes, useTheme } from "next-themes";
import { type ReactNode, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemes>
  );
}

const noopSubscribe = () => () => {};

/** Cycles light → dark → system. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme: rawTheme, setTheme } = useTheme();
  // The stored theme is only known in the browser; render "system" on the server.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const theme = mounted ? rawTheme : "system";
  const next = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
  const Icon = theme === "light" ? SunIcon : theme === "dark" ? MoonIcon : MonitorIcon;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={className}
      onClick={() => setTheme(next)}
      aria-label={`Theme: ${theme ?? "system"}. Switch to ${next}.`}
      title={`Theme: ${theme ?? "system"}`}
    >
      <Icon />
    </Button>
  );
}
