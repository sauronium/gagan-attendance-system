"use client";

import { EyeIcon, EyeOffIcon, Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { isValidPhone, normalizePhone } from "@/lib/phone";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Method = "mobile" | "email";

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [method, setMethod] = useState<Method>("mobile");
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get("password") ?? "");
    setError(null);

    const phoneNumber = normalizePhone(String(fd.get("mobile") ?? ""));
    const email = String(fd.get("email") ?? "").trim().toLowerCase();
    if (method === "mobile" && !isValidPhone(phoneNumber)) {
      setError("Enter your 10-digit mobile number.");
      return;
    }
    if (method === "email" && !EMAIL_RE.test(email)) {
      setError("Enter a valid email address.");
      return;
    }
    start(async () => {
      const { error: err } =
        method === "mobile"
          ? await authClient.signIn.phoneNumber({ phoneNumber, password, rememberMe: true })
          : await authClient.signIn.email({ email, password, rememberMe: true });
      if (err) {
        setError(
          err.status === 429
            ? "Too many attempts. Wait a minute and try again."
            : method === "mobile"
              ? "Mobile number or password is incorrect."
              : "Email or password is incorrect.",
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
      <div role="radiogroup" aria-label="Sign in with" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        {(
          [
            ["mobile", "Mobile number"],
            ["email", "Email"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={method === value}
            onClick={() => {
              setMethod(value);
              setError(null);
            }}
            className={cn(
              "h-9 rounded-md text-sm font-medium transition-colors",
              method === value ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {method === "mobile" ? (
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
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="name@example.com"
            required
            className="h-10"
            aria-invalid={error ? true : undefined}
          />
        </div>
      )}
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
