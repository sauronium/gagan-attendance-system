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
| Files | Cloudflare R2, or `.data/uploads/` locally when R2 isn't configured |
| SMS | Built-in **demo SMS API** (messages show in an in-app inbox); live provider later |
| Maps | Leaflet + OpenStreetMap |

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

Both are safe to run more than once.

## SMS

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
