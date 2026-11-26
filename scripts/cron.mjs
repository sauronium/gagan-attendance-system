#!/usr/bin/env node
/**
 * Scheduled-job runner for Hostinger cron (plain Node, no dependencies).
 *
 *   node scripts/cron.mjs daily   → GET <app>/api/cron/daily   (once a day)
 *   node scripts/cron.mjs sms     → GET <app>/api/cron/sms     (every 5–15 min)
 *
 * It calls the app's own protected endpoint, so the job logic lives in one
 * place and runs with the app's settings. Needs, from the environment (on
 * Hostinger: pass the site's env file with --env-file, Node 20.6+):
 *   CRON_SECRET                         same value the app uses
 *   CRON_BASE_URL | NEXT_PUBLIC_APP_URL | BETTER_AUTH_URL   the app's public URL
 *
 * Prints the job's JSON summary and exits non-zero on failure, so problems
 * show up in the cron output.
 *
 * Print the exact hPanel cron commands (and check Hostinger's 255-character
 * limit) for a Hostinger account and domain:
 *   node scripts/cron.mjs commands <u123456789> <your-domain.com> [node major, default 22]
 */

const JOBS = { daily: "/api/cron/daily", sms: "/api/cron/sms" };
const HOSTINGER_MAX = 255;

function commands(user, domain, nodeMajor = "22") {
  if (!/^u\d+$/.test(user ?? "") || !domain) {
    console.error("Usage: node scripts/cron.mjs commands <u123456789> <your-domain.com> [18|20|22|24]");
    process.exit(2);
  }
  if (Number(nodeMajor) < 20) {
    console.error("--env-file needs Node 20.6 or newer: pick 20, 22 or 24.");
    process.exit(2);
  }
  const site = `/home/${user}/domains/${domain}/hbuilds`;
  const base = `/opt/alt/alt-nodejs${nodeMajor}/root/bin/node --env-file=${site}/config/.env ${site}/current/nodejs/scripts/cron.mjs`;
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
  process.exit(ok ? 0 : 1);
}

async function run(job) {
  const path = JOBS[job];
  if (!path) {
    console.error(`Unknown job "${job ?? ""}". Use: ${Object.keys(JOBS).join(" | ")} | commands`);
    process.exit(2);
  }
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
    const res = await fetch(`${base}${path}`, {
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
