# Agam Ops Platform

Attendance, field visits and client messaging for **Agam Water Industries**.
One Next.js app serves the **admin portal** (desktop) and the **staff app**
(installable PWA for phones).

Spec: [`docs/project-doc.html`](docs/project-doc.html).

## Stack

| Layer | Choice |
|---|---|
| App | Next.js 16 (App Router), React 19, TypeScript |
| UI | Tailwind CSS v4, shadcn/ui (Base UI), Agam brand theme (light) |
| Data | MySQL 8, Drizzle ORM (`casing: snake_case`) |
| Auth | Better Auth: mobile number or email + password (phone-number plugin + email/password) |
| Files | A folder on the server (`STORAGE_DIR`, Hostinger), Hostinger FTP or Cloudflare R2 (Vercel); `.data/uploads/` in development |
| SMS | Built-in **demo SMS API** (messages show in an in-app inbox); live provider later |
| Maps | Leaflet + OpenStreetMap |
| Hosting | Hostinger Node.js web app ([guide](#deploying-to-hostinger)) or Vercel ([guide](#deploying-to-vercel)) |

## Getting started

1. **Install:** `npm install`
2. **Configure:** fill in `.env` (template: `.env.example`). The minimum is:
   - `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`: an empty MySQL 8 database (utf8mb4)
   - `BETTER_AUTH_SECRET` (`openssl rand -base64 32`) and `BETTER_AUTH_URL` (e.g. `http://localhost:3000`)
   - `SEED_ADMIN_MOBILE` and `SEED_ADMIN_PASSWORD` (and optionally `SEED_ADMIN_EMAIL`): the first Super Admin login
3. **Create tables:** `npm run db:migrate`
4. **Create the first login:** `npm run db:seed` (also adds the default SMS templates).
5. **Run:** `npm run dev`, open http://localhost:3000 and sign in with the admin mobile number (or email) and password.

Everyone signs in with their mobile number, or with their email if one is set on their employee record.

## Agent skills

AI-agent guidance (Better Auth, MySQL, frontend design, modern web practices) is listed in
`skills-lock.json` and installed into `.agents/skills/`, which is not committed. Restore it with:

```bash
npx skills experimental_install
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` / `lint` | Type and lint checks |
| `npm run db:generate` | New migration from schema changes (`drizzle/`) |
| `npm run db:migrate` | Apply migrations |
| `npm run db:studio` | Browse the database |
| `npm run db:seed` | First admin + SMS templates |
| `npm run cron:daily` / `cron:sms` | Trigger a scheduled job against `NEXT_PUBLIC_APP_URL` (needs `CRON_SECRET`) |
| `node scripts/cron.mjs commands <user> <domain>` | Print the Hostinger cron commands |

## Roles

| Role | Lands on | Can |
|---|---|---|
| Super Admin | `/dashboard` | Everything, incl. settings, templates and audit log |
| Office Admin | `/dashboard` | People, attendance, leave, clients, AMC, messages |
| Employee | `/me` | Check in/out, leave, field visits (field staff), history |
| AMC Technician | `/me` | Employee features plus assigned service jobs |

Self sign-up is disabled. Admins create logins on **Employees → Add employee**.

## Scheduled jobs

Two endpoints, both protected by `CRON_SECRET` (as a Bearer token or `?key=`):

- `/api/cron/daily`, once a day (e.g. Hostinger cron at 09:00 IST): marks yesterday's absences, week offs, holidays and missed punches; credits leave (yearly quota, monthly accrual, carry forward into a new year); sends service, filter-change, renewal, expiry and payment reminders; and sends queued SMS.
- `/api/cron/sms`, every 5–15 minutes: sends SMS scheduled from **Messages → Compose** when their time comes.

```bash
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/daily
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/sms
```

`scripts/cron.mjs` (plain Node, no dependencies) does the same from a server's cron: `node scripts/cron.mjs daily|sms`, reading `CRON_SECRET` and the app URL from the environment. Both jobs are safe to run more than once.

## Deploying to Hostinger

The Business (and higher) web hosting plans run Next.js as a **Node.js web app**, on the same server as the MySQL database, with cron jobs in hPanel.

### 1. Create the app

hPanel → **Websites → Add website → Node.js app** → *Import Git repository* (redeploys on every push to the branch). Build settings:

| Setting | Value |
|---|---|
| Framework preset | Next.js |
| Node version | 22.x (20.x and 24.x also work; `package.json` asks for ≥ 20.9) |
| Package manager | npm |
| Root directory | `/` |
| Build command | `npm run build` |
| Start command / entry (if asked) | `npm start` (`next start`, which listens on the port Hostinger gives it) |

### 2. Environment variables

Add these in the deploy wizard (or later under the site's **Environment variables**, then *Apply changes*). Don't commit a `.env` file; Hostinger says it can conflict with dashboard values. Paste values without quotes.

| Variable | Value |
|---|---|
| `DB_HOST` | `127.0.0.1` (not `localhost`, not the `srvNNNN.hstgr.io` remote host) |
| `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | `3306` and the database created in hPanel (names start with the `u123456789_` prefix) |
| `DB_CONNECTION_LIMIT` | `5` |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL` | `https://<your-domain>` |
| `APP_TIMEZONE` | `Asia/Kolkata` |
| `CRON_SECRET` | Random string, 16+ characters (used by the cron jobs below) |
| `STORAGE_DIR` | Folder for photos **outside** `hbuilds/` and `public_html`, e.g. `/home/u123456789/domains/<your-domain>/uploads`. Everything under `hbuilds/` is replaced on each deploy. (Alternatively use `FTP_*` + `STORAGE_URL` or `R2_*`.) |
| `FILES_SECRET` | Random string (defaults to `BETTER_AUTH_SECRET`) |
| `SMS_*`, `NEXT_PUBLIC_MAP_*` | As in `.env.example` |

`NEXT_PUBLIC_*` values are built into the app: after changing one, **redeploy**. Other variables are read at start-up: after changing one, **restart** the app from the site dashboard.

### 3. Database

Run `npm run db:migrate`, then `npm run db:seed` on a fresh database, from your own computer with the database's remote host in `.env` (hPanel → Databases → Remote MySQL must allow your IP). The deployed app itself always uses `127.0.0.1`.

### 4. Cron jobs

hPanel → the website → **Advanced → Cron Jobs**, one job per command. Hostinger runs Node.js cron jobs with its own Node binary and does **not** pass the app's variables, so each command loads the site's env file. Print the exact commands for your account and domain (it also checks Hostinger's 255-character limit):

```bash
node scripts/cron.mjs commands u123456789 your-domain.com
```

which prints, for example:

| Schedule (UTC) | Command |
|---|---|
| `30 3 * * *` (09:00 IST) | `/opt/alt/alt-nodejs22/root/bin/node --env-file=/home/u123456789/domains/your-domain.com/hbuilds/config/.env /home/u123456789/domains/your-domain.com/hbuilds/current/nodejs/scripts/cron.mjs daily` |
| `*/10 * * * *` | the same command ending in `sms` |

Match the `alt-nodejs22` part to the app's Node version. If a command would be too long, use the curl form instead (it needs no env file): `curl -fsS "https://your-domain.com/api/cron/daily?key=<CRON_SECRET>"`. Cron output can be checked in hPanel; a healthy daily run prints `"ok":true`.

### Limits to keep in mind

- Requests are stopped after 120 seconds and cron jobs after 30 minutes. The daily job takes a few seconds.
- Background workers and custom ports aren't supported, which is why scheduled work runs through cron.
- `your-domain` and `www.your-domain` each run their own Node process and count toward the plan's process limit, so redirect `www` to the main domain.

## Deploying to Vercel

`vercel.json` pins the functions to Mumbai (`bom1`, close to the Hostinger database and to staff) and schedules the daily job at 09:00 IST.

1. **Database access.** Vercel has no fixed IP addresses, so in Hostinger hPanel → *Databases → Remote MySQL*, allow connections from any host (`%`) for the app's database user, and use the server's IP or `srvNNNN.hstgr.io` host as `DB_HOST`. Run `npm run db:migrate` (and `npm run db:seed` on a fresh database) from your own computer.
2. **File storage.** Vercel's disk is read-only, so photos need R2 or FTP. R2 is recommended (`R2_*`); Hostinger FTP (`FTP_*` + `STORAGE_URL`) also works. Pick one and keep it: photos saved to one aren't visible through the other. If both are set, Vercel uses R2.
3. **Import the repository** in Vercel (framework: Next.js, default build settings).
4. **Environment variables** (Project → Settings → Environment Variables), for Production and Preview:

   | Variable | Value |
   |---|---|
   | `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Hostinger database |
   | `DB_CONNECTION_LIMIT` | `3` (per function instance; Hostinger also caps new connections per hour) |
   | `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
   | `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL` | Production URL, e.g. `https://ops.agamwater.in` (or the `*.vercel.app` one). Preview deployments work without changes. |
   | `CRON_SECRET` | Random string, 16+ characters. Vercel sends it automatically to the cron job. |
   | `APP_TIMEZONE` | `Asia/Kolkata` |
   | `R2_*` or `FTP_*` + `STORAGE_URL` + `FILES_SECRET` | File storage (step 2) |
   | `SMS_*`, `NEXT_PUBLIC_MAP_*` | As in `.env.example` |

   Do not set the `SEED_*` values in Vercel; they are only for `npm run db:seed` on your computer.
5. **Deploy**, then sign in with the Super Admin account.

**Scheduled SMS.** The daily job (in `vercel.json`) runs on every Vercel plan. Messages scheduled from **Messages → Compose** also need `/api/cron/sms` every 5–15 minutes:

- On the **Pro** plan, add it to `vercel.json`: `{ "path": "/api/cron/sms", "schedule": "*/10 * * * *" }`. The Hobby plan only allows daily crons, and a deployment with a more frequent schedule fails.
- On **Hobby**, use any external scheduler (e.g. cron-job.org) to call `https://<your-domain>/api/cron/sms?key=<CRON_SECRET>` every 10 minutes. Without it, scheduled messages go out with the next morning's daily job.


`SMS_PROVIDER=demo` (the default) never contacts a phone network. Every message is stored and shown under **Messages → Inbox**, and `SMS_DEMO_FAILURE_RATE` simulates failures. To go live, choose a provider, register DLT templates, set `SMS_PROVIDER=live` with `SMS_API_URL`/`SMS_API_KEY`, and adapt `deliverLive()` in `src/lib/sms.ts` to that provider's API.

## Project layout

```
src/
  app/(auth)/login        sign-in
  app/(admin)/…           admin portal (dashboard, attendance, leave, visits,
                          employees, clients, amc, complaints, messages,
                          settings, audit)
  app/(staff)/me/…        mobile staff app
  app/api/…               auth, files, exports, cron
  components/ui           shadcn/ui primitives
  components/app          shared app components (badges, tables, dialogs…)
  db/schema               Drizzle tables + relations
  lib/                    auth, session, time, sms, storage, rules, labels
  server/                 server-only data and business logic
scripts/seed.ts           first admin + SMS templates
drizzle/                  SQL migrations
```
