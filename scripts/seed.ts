/**
 * Seed script: `npm run db:seed`
 *
 * Creates the first Super Admin login and the default SMS templates.
 * Reads SEED_ADMIN_NAME / SEED_ADMIN_MOBILE / SEED_ADMIN_PASSWORD and the
 * optional SEED_ADMIN_EMAIL from .env. Safe to re-run: the admin and the
 * templates are only created once.
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

import { randomUUID } from "node:crypto";

import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { z } from "zod";

import * as s from "../src/db/schema";
import { placeholderEmail } from "../src/lib/login-email";
import { isValidPhone, normalizePhone } from "../src/lib/phone";

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 4,
  timezone: "Z",
});
const db = drizzle({ client: pool, schema: s, mode: "default", casing: "snake_case" });

async function seedAdmin() {
  const existing = await db.query.employees.findFirst({ where: eq(s.employees.role, "super_admin") });
  if (existing) {
    console.log(`✓ Super Admin already exists (${existing.name}). Skipping.`);
    return;
  }
  const name = process.env.SEED_ADMIN_NAME?.trim() || "Super Admin";
  const mobile = normalizePhone(process.env.SEED_ADMIN_MOBILE ?? "");
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase() || null;
  const password = process.env.SEED_ADMIN_PASSWORD ?? "";
  if (!isValidPhone(mobile) || password.length < 8) {
    throw new Error("Set SEED_ADMIN_MOBILE (10-digit mobile) and SEED_ADMIN_PASSWORD (8+ chars) in .env first.");
  }
  if (email && !z.email().safeParse(email).success) {
    throw new Error("SEED_ADMIN_EMAIL is not a valid email address.");
  }

  const empCode = "AGM001";
  const userId = randomUUID();
  await db.insert(s.user).values({
    id: userId,
    name,
    email: email ?? placeholderEmail(empCode),
    emailVerified: false,
    phoneNumber: mobile,
    phoneNumberVerified: true,
  });
  await db.insert(s.account).values({
    id: randomUUID(),
    accountId: userId,
    providerId: "credential",
    userId,
    password: await hashPassword(password),
  });
  await db
    .insert(s.employees)
    .values({ empCode, name, mobile, email, role: "super_admin", workType: "office", designation: "Owner", userId });
  console.log(
    `✓ Created Super Admin ${name} (${mobile}${email ? `, ${email}` : ""}). Sign in with that ${email ? "mobile or email" : "mobile"} and SEED_ADMIN_PASSWORD.`,
  );
}

// Default SMS templates (editable later in Messages → Templates).
const TEMPLATES: (typeof s.smsTemplates.$inferInsert)[] = [
  { key: "contract_created", name: "AMC activated", trigger: "contract_created", audience: "client", variables: ["client", "contractNo", "endDate"],
    body: "Dear {{client}}, your Agam Water AMC {{contractNo}} is now active till {{endDate}}. We will remind you before every service. – Agam Water Industries" },
  { key: "service_due", name: "Service due reminder", trigger: "service_due", audience: "client", offsetDays: [7, 3], variables: ["client", "date"],
    body: "Dear {{client}}, your RO plant service is due on {{date}}. Our technician will call before the visit. – Agam Water Industries" },
  { key: "technician_assigned", name: "Technician assigned", trigger: "technician_assigned", audience: "client", variables: ["client", "technician", "technicianPhone", "date"],
    body: "Dear {{client}}, technician {{technician}} ({{technicianPhone}}) will visit on {{date}} for your RO plant service. – Agam Water Industries" },
  { key: "technician_job", name: "Job for technician", trigger: "technician_assigned", audience: "technician", variables: ["client", "address", "contact", "contactPhone", "date"],
    body: "New job {{date}}: {{client}}, {{address}}. Contact {{contact}} {{contactPhone}}. – Agam Ops" },
  { key: "visit_today", name: "Visit today", trigger: "visit_today", audience: "client", variables: ["client", "technician"],
    body: "Dear {{client}}, our technician {{technician}} is scheduled to visit you today for RO plant service. – Agam Water Industries" },
  { key: "service_completed", name: "Service completed", trigger: "service_completed", audience: "client", variables: ["client", "nextDate"],
    body: "Dear {{client}}, your RO plant service is complete. Next service is due on {{nextDate}}. Thank you! – Agam Water Industries" },
  { key: "filter_change_due", name: "Filter change due", trigger: "filter_change_due", audience: "client", variables: ["client", "date"],
    body: "Dear {{client}}, the filters/membrane of your RO plant are due for replacement around {{date}}. Reply or call us to schedule. – Agam Water Industries" },
  { key: "amc_renewal_due", name: "AMC renewal reminder", trigger: "amc_renewal_due", audience: "client", offsetDays: [30, 15, 7], variables: ["client", "contractNo", "endDate"],
    body: "Dear {{client}}, your AMC {{contractNo}} expires on {{endDate}}. Renew now to keep your RO plant serviced on time. – Agam Water Industries" },
  { key: "amc_expired", name: "AMC expired", trigger: "amc_expired", audience: "client", variables: ["client", "contractNo"],
    body: "Dear {{client}}, your AMC {{contractNo}} has expired. Call us to renew and avoid breakdowns. – Agam Water Industries" },
  { key: "payment_due", name: "Payment due", trigger: "payment_due", audience: "client", variables: ["client", "contractNo", "amount"],
    body: "Dear {{client}}, a payment of {{amount}} is pending for AMC {{contractNo}}. Please clear it at the earliest. – Agam Water Industries" },
  { key: "complaint_received", name: "Complaint received", trigger: "complaint_received", audience: "client", variables: ["client", "ticket"],
    body: "Dear {{client}}, we have received your complaint. Ticket {{ticket}}. Our team will contact you shortly. – Agam Water Industries" },
  { key: "complaint_resolved", name: "Complaint resolved", trigger: "complaint_resolved", audience: "client", variables: ["client", "ticket"],
    body: "Dear {{client}}, your complaint {{ticket}} has been resolved. Thank you for your patience. – Agam Water Industries" },
  { key: "festive_greeting", name: "Festive greeting", trigger: "manual", audience: "client", variables: ["client"],
    body: "Dear {{client}}, warm wishes from all of us at Agam Water Industries. Stay healthy, drink pure!" },
  { key: "announcement", name: "General announcement", trigger: "manual", audience: "client", variables: ["client", "message"],
    body: "Dear {{client}}, {{message}} – Agam Water Industries" },
];

async function main() {
  if (!process.env.DB_HOST || !process.env.DB_NAME) {
    throw new Error("Fill the DB_* values in .env and run `npm run db:migrate` first.");
  }
  await seedAdmin();
  if (!(await db.query.smsTemplates.findFirst({ columns: { id: true } }))) {
    await db.insert(s.smsTemplates).values(TEMPLATES);
    console.log(`✓ Added ${TEMPLATES.length} SMS templates.`);
  }
}

main()
  .catch((e) => {
    console.error("✗", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
