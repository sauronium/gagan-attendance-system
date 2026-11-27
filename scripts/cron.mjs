#!/usr/bin/env node
/**
 * Scheduled-job runner for Hostinger cron (plain Node, no dependencies).
 *
 *   node scripts/cron.mjs daily   → GET <app>/api/cron/daily   (once a day)
 *   node scripts/cron.mjs sms     → GET <app>/api/cron/sms     (every 5–15 min)
 *
 * It calls the app's own protected endpoint, so the job logic lives in one
 * place and runs with the app's settings. It needs:
 *   CRON_SECRET                         same value the app uses
 *   CRON_BASE_URL | NEXT_PUBLIC_APP_URL | BETTER_AUTH_URL   the app's public URL
 * taken from the environment, or else from the .env file next to the app
 * (one folder up from this script, as deployed on Hostinger), so cron
 * commands stay short: Hostinger allows 255 characters.
 *
 * Prints the job's JSON summary and exits non-zero on failure, so problems
 * show up in the cron output.
 *
 * Print the exact hPanel cron commands (and check the length limit):
 *   node scripts/cron.mjs commands <u123456789> <your-domain.com> [node major, default 22]
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const JOBS = { daily: "/api/cron/daily", sms: "/api/cron/sms" };
const HOSTINGER_MAX = 255;

/** Load the app's .env (next to the app, or in the working directory) without overriding real env vars. */
function loadAppEnv() {
  if (process.env.CRON_SECRET) return;
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const file of [path.join(here, "..", ".env"), path.join(process.cwd(), ".env")]) {
    if (!existsSync(file)) continue;
    try {
      process.loadEnvFile(file); // Node 20.12+; keeps variables that are already set
      return;
    } catch (e) {
      console.error(`Could not read ${file}: ${e instanceof Error ? e.message : e}`);
    }
  }
}

function commands(user, domain, nodeMajor = "22") {
  if (!/^u\d+$/.test(user ?? "") || !domain) {
    console.error("Usage: node scripts/cron.mjs commands <u123456789> <your-domain.com> [20|22|24]");
    process.exit(2);
  }
  const script = `/home/${user}/domains/${domain}/hbuilds/current/nodejs/scripts/cron.mjs`;
  const base = `/opt/alt/alt-nodejs${nodeMajor}/root/bin/node ${script}`;
  const rows = [
    ["daily", "30 3 * * *", "09:00 IST (Hostinger cron runs on UTC)"],
    ["sms", "*/10 * * * *", "every 10 minutes"],
  ];
  let ok = true;
  for (const [job, schedule, when] of rows) {
    const cmd = `${base} ${job}`;
    const fits = cmd.length <= HOSTINGER_MAX;
    ok &&= fits;
    console.log(`\n${job}: schedule "${schedule}" (${when})`);
    console.log(cmd);
    console.log(`${cmd.length}/${HOSTINGER_MAX} characters${fits ? "" : "  ← too long for Hostinger; use the curl form in the README"}`);
  }
  console.log("\nThe script reads CRON_SECRET and the app URL from the deployed app's .env.");
  process.exit(ok ? 0 : 1);
}

async function run(job) {
  const route = JOBS[job];
  if (!route) {
    console.error(`Unknown job "${job ?? ""}". Use: ${Object.keys(JOBS).join(" | ")} | commands`);
    process.exit(2);
  }
  loadAppEnv();
  const secret = process.env.CRON_SECRET?.trim();
  const base = (process.env.CRON_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL || "")
    .trim()
    .replace(/\/+$/, "");
  if (!secret || !base) {
    console.error("Set CRON_SECRET and the app URL (CRON_BASE_URL, NEXT_PUBLIC_APP_URL or BETTER_AUTH_URL).");
    process.exit(2);
  }

  const started = Date.now();
  try {
    const res = await fetch(`${base}${route}`, {
      headers: { authorization: `Bearer ${secret}` },
      // Hostinger stops web requests after 120 s; give up a little later.
      signal: AbortSignal.timeout(150_000),
    });
    const body = await res.text();
    console.log(`${new Date().toISOString()} ${job} → HTTP ${res.status} in ${Date.now() - started} ms`);
    console.log(body);
    process.exit(res.ok ? 0 : 1);
  } catch (e) {
    console.error(`${new Date().toISOString()} ${job} failed: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
}

const [arg, ...rest] = process.argv.slice(2);
if (arg === "commands") commands(...rest);
else await run(arg);
