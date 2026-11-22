"use client";

import { LogOutIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export function SignOutButton({
  className,
  variant = "ghost",
  label = "Sign out",
}: {
  className?: string;
  variant?: "ghost" | "outline";
  label?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant={variant}
      className={cn("justify-start", className)}
      disabled={pending}
      aria-label={label ? undefined : "Sign out"}
      title={label ? undefined : "Sign out"}
      onClick={() =>
        start(async () => {
          await signOut();
          router.replace("/login");
          router.refresh();
        })
      }
    >
      <LogOutIcon />
      {label ? (pending ? "Signing out…" : label) : null}
    </Button>
  );
}
