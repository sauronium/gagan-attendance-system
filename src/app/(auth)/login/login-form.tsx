"use client";

import { EyeIcon, EyeOffIcon, Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { isValidPhone, normalizePhone } from "@/lib/phone";

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const phoneNumber = normalizePhone(String(fd.get("mobile") ?? ""));
    const password = String(fd.get("password") ?? "");
    setError(null);
    if (!isValidPhone(phoneNumber)) {
      setError("Enter your 10-digit mobile number.");
      return;
    }
    start(async () => {
      const { error: err } = await authClient.signIn.phoneNumber({
        phoneNumber,
        password,
        rememberMe: true,
      });
      if (err) {
        setError(
          err.status === 429
            ? "Too many attempts. Wait a minute and try again."
            : "Mobile number or password is incorrect.",
        );
        return;
      }
      // Only follow same-site relative paths.
      const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
      router.replace(target);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="mobile">Mobile number</Label>
        <div className="flex">
          <span className="inline-flex items-center rounded-l-lg border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">
            +91
          </span>
          <Input
            id="mobile"
            name="mobile"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="98123 45678"
            required
            className="h-10 rounded-l-none"
            aria-invalid={error ? true : undefined}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            minLength={8}
            className="h-10 pr-10"
            aria-invalid={error ? true : undefined}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:text-foreground"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
          </button>
        </div>
      </div>
      {error ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={pending}
        className="h-10 bg-brand-gradient text-base font-semibold text-white hover:opacity-90"
      >
        {pending ? <Loader2Icon className="animate-spin" /> : null}
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Forgot your password? Ask your office admin to reset it.
      </p>
    </form>
  );
}
