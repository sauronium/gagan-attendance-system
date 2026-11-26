import "server-only";

import { timingSafeEqual } from "node:crypto";

import type { NextRequest } from "next/server";

import { env } from "@/lib/env";

/** Constant-time string compare, so the secret can't be guessed by timing. */
function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Cron endpoints accept `Authorization: Bearer <CRON_SECRET>` or, for
 * schedulers that can't set headers, `?key=<CRON_SECRET>`. Always false while
 * CRON_SECRET is blank.
 */
export function cronAuthorised(request: NextRequest): boolean {
  const secret = env.cronSecret;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const key = request.nextUrl.searchParams.get("key") ?? "";
  return (bearer !== "" && safeEqual(bearer, secret)) || (key !== "" && safeEqual(key, secret));
}
