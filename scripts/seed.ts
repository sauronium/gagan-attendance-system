/**
 * Seed script.
 *
 *   npm run db:seed            → creates the first Super Admin login
 *   npm run db:seed -- --demo  → also fills the database with demo data
 *                                (staff, 2 weeks of attendance, leave, clients,
 *                                AMC contracts, service visits, field visits,
 *                                SMS templates and demo messages)
 *
 * Reads SEED_ADMIN_NAME / SEED_ADMIN_MOBILE / SEED_ADMIN_PASSWORD and, for
 * demo staff, SEED_DEMO_PASSWORD (falls back to the admin password) from .env.
 * Safe to re-run: the admin is created once; demo data only if no clients exist.
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

import { randomUUID } from "node:crypto";

import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";

import * as s from "../src/db/schema";
import { DEFAULT_SHIFT, evaluateCheckIn, evaluateCheckOut, type ShiftRules } from "../src/lib/attendance-rules";
import { isValidPhone, normalizePhone } from "../src/lib/phone";
import { addDays, eachDay, todayIso, weekdayIndex, zonedMidnight } from "../src/lib/time";

const TZ = process.env.APP_TIMEZONE?.trim() || "Asia/Kolkata";
const DEMO = process.argv.includes("--demo");

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

// Deterministic pseudo-random numbers so demo data is the same every run.
let seed = 20261122;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
const between = (a: number, b: number) => Math.round(a + rand() * (b - a));

/** Local date + minutes since midnight → UTC Date. */
const at = (date: string, minutes: number) => new Date(zonedMidnight(date, TZ).getTime() + minutes * 60_000);

async function createLogin(name: string, phone: string, email: string, password: string) {
  const id = randomUUID();
  await db.insert(s.user).values({ id, name, email, emailVerified: false, phoneNumber: phone, phoneNumberVerified: true });
  await db.insert(s.account).values({
    id: randomUUID(),
    accountId: id,
    providerId: "credential",
    userId: id,
    password: await hashPassword(password),
  });
  return id;
}

const placeholderEmail = (code: string) => `${code.toLowerCase()}@staff.agamops.invalid`;

async function seedAdmin() {
  const existing = await db.query.employees.findFirst({ where: eq(s.employees.role, "super_admin") });
  if (existing) {
    console.log(`✓ Super Admin already exists (${existing.name}). Skipping.`);
    return existing.id;
  }
  const name = process.env.SEED_ADMIN_NAME?.trim() || "Super Admin";
  const mobile = normalizePhone(process.env.SEED_ADMIN_MOBILE ?? "");
  const password = process.env.SEED_ADMIN_PASSWORD ?? "";
  if (!isValidPhone(mobile) || password.length < 8) {
    throw new Error("Set SEED_ADMIN_MOBILE (10-digit mobile) and SEED_ADMIN_PASSWORD (8+ chars) in .env first.");
  }
  const userId = await createLogin(name, mobile, placeholderEmail("AGM001"), password);
  const [row] = await db
    .insert(s.employees)
    .values({ empCode: "AGM001", name, mobile, role: "super_admin", workType: "office", designation: "Owner", userId })
    .$returningId();
  console.log(`✓ Created Super Admin ${name} (${mobile}). Sign in with that mobile and SEED_ADMIN_PASSWORD.`);
  return row.id;
}

// ─────────────────────────────────────────────────────────────

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

async function seedDemo(adminId: number) {
  if (await db.query.clients.findFirst({ columns: { id: true } })) {
    console.log("✓ Demo data skipped: clients already exist.");
    return;
  }
  const today = todayIso(TZ);
  const year = Number(today.slice(0, 4));
  const password = process.env.SEED_DEMO_PASSWORD || process.env.SEED_ADMIN_PASSWORD || "";
  if (password.length < 8) throw new Error("Set SEED_DEMO_PASSWORD (8+ chars) for demo staff logins.");

  // ── Org setup ──
  const deptIds: Record<string, number> = {};
  for (const name of ["Management", "Office", "Sales", "AMC Service", "Production"]) {
    const [r] = await db.insert(s.departments).values({ name }).$returningId();
    deptIds[name] = r.id;
  }
  await db.update(s.employees).set({ departmentId: deptIds.Management }).where(eq(s.employees.id, adminId));

  const generalShift: ShiftRules = DEFAULT_SHIFT;
  const fieldShift: ShiftRules = { ...DEFAULT_SHIFT, startTime: "09:00:00", endTime: "18:00:00", halfDayAfter: "10:30:00" };
  const [general] = await db.insert(s.shifts).values({ name: "General", ...generalShift, weeklyOffs: [0] }).$returningId();
  const [field] = await db.insert(s.shifts).values({ name: "Field", ...fieldShift, weeklyOffs: [0] }).$returningId();

  const OFFICE = { lat: 28.6139, lng: 77.209 };
  const [office] = await db
    .insert(s.officeLocations)
    .values({ name: "Main office (demo location)", address: "Update in Settings → Office locations", ...OFFICE, radiusM: 150 })
    .$returningId();

  const typeIds: Record<string, number> = {};
  for (const t of [
    { code: "CL", name: "Casual leave", isPaid: true },
    { code: "SL", name: "Sick leave", isPaid: true },
    { code: "PL", name: "Earned leave", isPaid: true },
    { code: "CO", name: "Comp-off", isPaid: true },
    { code: "LWP", name: "Leave without pay", isPaid: false },
  ]) {
    const [r] = await db.insert(s.leaveTypes).values(t).$returningId();
    typeIds[t.code] = r.id;
  }
  const [policy] = await db.insert(s.leavePolicies).values({ name: "Standard" }).$returningId();
  await db.insert(s.leavePolicyTypes).values([
    { policyId: policy.id, leaveTypeId: typeIds.CL, yearlyQuota: 8, accrual: "yearly", maxContinuousDays: 2 },
    { policyId: policy.id, leaveTypeId: typeIds.SL, yearlyQuota: 6, accrual: "yearly", documentAfterDays: 2 },
    { policyId: policy.id, leaveTypeId: typeIds.PL, yearlyQuota: 15, accrual: "monthly", carryForwardMax: 30, minNoticeDays: 7 },
    { policyId: policy.id, leaveTypeId: typeIds.CO, yearlyQuota: 0, accrual: "none", expiresAfterDays: 60 },
    { policyId: policy.id, leaveTypeId: typeIds.LWP, yearlyQuota: 0, accrual: "none" },
  ]);
  await db.update(s.employees).set({ leavePolicyId: policy.id, shiftId: general.id }).where(eq(s.employees.id, adminId));

  await db.insert(s.holidays).values([
    { date: `${year}-01-26`, name: "Republic Day" },
    { date: `${year}-08-15`, name: "Independence Day" },
    { date: `${year}-10-02`, name: "Gandhi Jayanti" },
    { date: `${year}-12-25`, name: "Christmas" },
  ]);

  // ── Staff ──
  type Staff = { id: number; name: string; role: s.EmployeeRole; workType: s.WorkType; shift: ShiftRules; phone: string };
  const people: Array<[string, s.EmployeeRole, string, s.WorkType, string]> = [
    ["Neha Sharma", "office_admin", "Office", "office", "Office Manager"],
    ["Rohit Verma", "employee", "Office", "office", "Accounts Executive"],
    ["Pooja Singh", "employee", "Office", "office", "Customer Support"],
    ["Karan Mehta", "employee", "Office", "office", "Store Keeper"],
    ["Sunil Yadav", "employee", "Production", "office", "Plant Operator"],
    ["Deepak Kumar", "employee", "Production", "office", "Fabricator"],
    ["Ravi Kumar", "employee", "Sales", "field", "Sales Executive"],
    ["Anjali Gupta", "employee", "Sales", "field", "Sales Executive"],
    ["Vikas Chauhan", "employee", "Sales", "field", "Area Sales Manager"],
    ["Amit Patel", "technician", "AMC Service", "field", "Senior Technician"],
    ["Manoj Rawat", "technician", "AMC Service", "field", "Technician"],
    ["Sanjay Bisht", "technician", "AMC Service", "field", "Technician"],
    ["Imran Khan", "technician", "AMC Service", "field", "Technician"],
  ];
  const staff: Staff[] = [];
  let n = 2;
  for (const [name, role, dept, workType, designation] of people) {
    const code = `AGM${String(n).padStart(3, "0")}`;
    const phone = `+919810000${String(n).padStart(3, "0")}`;
    const userId = await createLogin(name, phone, placeholderEmail(code), password);
    const shift = workType === "field" ? fieldShift : generalShift;
    const [r] = await db
      .insert(s.employees)
      .values({
        empCode: code, name, mobile: phone, role, workType, designation, userId,
        departmentId: deptIds[dept], shiftId: workType === "field" ? field.id : general.id,
        leavePolicyId: policy.id, managerId: role === "employee" && dept !== "Office" ? adminId : null,
        joinedOn: `${year - 1 - (n % 3)}-0${(n % 9) + 1}-01`, status: "active",
      })
      .$returningId();
    if (workType === "office") await db.insert(s.employeeLocations).values({ employeeId: r.id, locationId: office.id });
    staff.push({ id: r.id, name, role, workType, shift, phone });
    n++;
  }
  const byName = (name: string) => staff.find((p) => p.name === name)!;
  const techs = staff.filter((p) => p.role === "technician");
  const sales = staff.filter((p) => p.role === "employee" && p.workType === "field");

  const month = Number(today.slice(5, 7));
  for (const p of [...staff, { id: adminId }]) {
    await db.insert(s.leaveBalances).values([
      { employeeId: p.id, leaveTypeId: typeIds.CL, year, credited: 8, used: between(0, 3) },
      { employeeId: p.id, leaveTypeId: typeIds.SL, year, credited: 6, used: between(0, 2) },
      { employeeId: p.id, leaveTypeId: typeIds.PL, year, credited: Math.floor(month * 1.25 * 2) / 2, used: between(0, 4) },
    ]);
  }

  // ── Leave requests ──
  const pooja = byName("Pooja Singh");
  const [approvedToday] = await db
    .insert(s.leaveRequests)
    .values({ employeeId: pooja.id, leaveTypeId: typeIds.CL, fromDate: today, toDate: addDays(today, 1), days: 2, reason: "Family function", status: "approved", approverId: adminId, decidedAt: new Date() })
    .$returningId();
  await db.insert(s.leaveRequests).values([
    { employeeId: byName("Rohit Verma").id, leaveTypeId: typeIds.PL, fromDate: addDays(today, 10), toDate: addDays(today, 14), days: 4, reason: "Travelling home" },
    { employeeId: byName("Amit Patel").id, leaveTypeId: typeIds.SL, fromDate: addDays(today, 1), toDate: addDays(today, 1), days: 1, reason: "Doctor's appointment" },
    { employeeId: byName("Anjali Gupta").id, leaveTypeId: typeIds.CL, fromDate: addDays(today, 5), toDate: addDays(today, 5), halfDay: "second_half", days: 0.5, reason: "Personal work" },
    { employeeId: byName("Sunil Yadav").id, leaveTypeId: typeIds.CL, fromDate: addDays(today, -20), toDate: addDays(today, -20), days: 1, reason: "Personal", status: "rejected", approverId: adminId, decidedAt: new Date(), decisionRemark: "Plant shutdown scheduled that day" },
  ]);

  // ── Attendance: last 14 days + today ──
  const days = eachDay(addDays(today, -14), today);
  const rows: (typeof s.attendance.$inferInsert)[] = [];
  for (const p of staff) {
    for (const date of days) {
      if (weekdayIndex(date) === 0) {
        if (date !== today) rows.push({ employeeId: p.id, date, status: "week_off", flags: { autoMarked: true } });
        continue;
      }
      if (p.id === pooja.id && date >= today) {
        rows.push({ employeeId: p.id, date, status: "on_leave", leaveRequestId: approvedToday.id, flags: { autoMarked: true } });
        continue;
      }
      const isToday = date === today;
      if (isToday && (p.name === "Karan Mehta" || p.name === "Imran Khan")) continue; // not checked in yet
      const roll = rand();
      if (!isToday && roll < 0.03) { rows.push({ employeeId: p.id, date, status: "absent", flags: { autoMarked: true } }); continue; }
      const start = Number(p.shift.startTime.slice(0, 2)) * 60 + Number(p.shift.startTime.slice(3, 5));
      const inMin = roll < 0.85 ? start - between(2, 18) : roll < 0.95 ? start + between(16, 70) : start + between(95, 130);
      const checkIn = evaluateCheckIn(inMin, p.shift);
      const lat = OFFICE.lat + (rand() - 0.5) * 0.0012;
      const lng = OFFICE.lng + (rand() - 0.5) * 0.0012;
      const flags: s.AttendanceFlags = {};
      if (isToday && p.name === "Deepak Kumar") flags.weakGps = true;
      if (isToday && p.name === "Rohit Verma") flags.outsideOffice = true;
      const row: typeof s.attendance.$inferInsert = {
        employeeId: p.id, date, status: checkIn.status, lateMinutes: checkIn.lateMinutes,
        checkInAt: at(date, inMin), checkInLat: p.name === "Rohit Verma" && isToday ? OFFICE.lat + 0.006 : lat,
        checkInLng: lng, checkInAccuracyM: flags.weakGps ? 160 : between(6, 30),
        checkInLocationId: p.workType === "office" ? office.id : null,
        checkInDistanceM: p.workType === "office" ? (flags.outsideOffice ? 680 : between(5, 60)) : null,
        flags: Object.keys(flags).length ? flags : null,
      };
      if (!isToday) {
        const outMin = Number(p.shift.endTime.slice(0, 2)) * 60 + between(-20, 75);
        const out = evaluateCheckOut({ checkInMin: inMin, checkOutMin: outMin, checkInStatus: checkIn.status }, p.shift);
        Object.assign(row, { checkOutAt: at(date, outMin), checkOutLat: lat, checkOutLng: lng, checkOutAccuracyM: between(6, 30), ...out });
      }
      rows.push(row);
    }
  }
  await db.insert(s.attendance).values(rows);
  await db.insert(s.regularisations).values({
    employeeId: byName("Sunil Yadav").id, date: addDays(today, -2), type: "missed_check_out",
    requestedCheckOutAt: at(addDays(today, -2), 18 * 60 + 40), reason: "Phone battery died before check-out",
  });

  // ── Clients, sites, plants ──
  const clientSeed: Array<[string, s.ClientSegment, string, string, number, number, number]> = [
    ["Sharma Dairy Pvt Ltd", "industrial", "Okhla Phase 2", "New Delhi", 28.5355, 77.271, 5000],
    ["Green Valley School", "institution", "Dwarka Sector 10", "New Delhi", 28.5823, 77.0500, 1000],
    ["Hotel Royal Residency", "commercial", "Karol Bagh", "New Delhi", 28.6519, 77.1909, 2000],
    ["Sunrise Hospital", "institution", "Sector 62", "Noida", 28.6270, 77.3650, 3000],
    ["Mehta Packaged Water", "industrial", "Udyog Vihar", "Gurugram", 28.4996, 77.0880, 10000],
    ["City Centre Mall", "commercial", "Rajouri Garden", "New Delhi", 28.6415, 77.1209, 1500],
    ["Gupta Residence", "domestic", "Vasant Kunj", "New Delhi", 28.5293, 77.1517, 250],
    ["Krishna Ice Factory", "industrial", "Bawana", "New Delhi", 28.7977, 77.0410, 4000],
  ];
  type C = { id: number; name: string; siteId: number; lat: number; lng: number; installationId: number; contactId: number; phone: string; area: string };
  const clientsMade: C[] = [];
  let cn = 1;
  for (const [name, segment, area, city, lat, lng, lph] of clientSeed) {
    const [c] = await db
      .insert(s.clients)
      .values({ name, segment, type: segment === "domestic" ? "individual" : "company", status: "active", source: pick(["Referral", "Field visit", "Website", "Walk-in"]), salesOwnerId: pick(sales).id, createdBy: adminId })
      .$returningId();
    const phone = `+919900000${String(cn).padStart(3, "0")}`;
    const [contact] = await db.insert(s.clientContacts).values({ clientId: c.id, name: `${pick(["Mr.", "Ms."])} ${name.split(" ")[0]}`, designation: segment === "domestic" ? "Owner" : "Facility Manager", phone, isPrimary: true }).$returningId();
    const [site] = await db.insert(s.clientSites).values({ clientId: c.id, label: "Main site", addressLine: `Plot ${between(10, 300)}, ${area}`, area, city, state: city === "Noida" ? "Uttar Pradesh" : city === "Gurugram" ? "Haryana" : "Delhi", lat, lng }).$returningId();
    const [inst] = await db
      .insert(s.installations)
      .values({ siteId: site.id, plantType: lph >= 2000 ? "Industrial RO" : "Commercial RO", capacityLph: lph, model: `AWI-RO-${lph}`, serialNo: `AWI${year}${String(cn).padStart(4, "0")}`, membraneSpec: lph >= 2000 ? "8040 BW x 4" : "4040 BW x 2", installedOn: addDays(today, -between(200, 900)), installedBy: pick(techs).id, warrantyUntil: addDays(today, between(-200, 200)) })
      .$returningId();
    clientsMade.push({ id: c.id, name, siteId: site.id, lat, lng, installationId: inst.id, contactId: contact.id, phone, area });
    cn++;
  }

  // ── AMC contracts + service visits ──
  const contractStarts = [-300, -200, -340, -100, -350, -30, -60];
  for (let i = 0; i < contractStarts.length; i++) {
    const c = clientsMade[i];
    const startOn = addDays(today, contractStarts[i]);
    const endOn = addDays(addDays(startOn, 365), -1);
    const expired = endOn < today;
    const value = String(between(8, 60) * 1000);
    const paid = i % 3 === 0 ? "0" : i % 3 === 1 ? value : String(Number(value) / 2);
    const [k] = await db
      .insert(s.amcContracts)
      .values({ contractNo: `AMC-${year}-${String(i + 1).padStart(4, "0")}`, installationId: c.installationId, plan: i % 2 ? "non_comprehensive" : "comprehensive", startOn, endOn, visitsPerYear: 4, filterChangeEveryDays: 90, membraneChangeEveryDays: 730, value, amountPaid: paid, paymentStatus: paid === "0" ? "unpaid" : paid === value ? "paid" : "partial", status: expired ? "expired" : "active", createdBy: adminId })
      .$returningId();
    const tech = techs[i % techs.length];
    for (let v = 1; v <= 4; v++) {
      const dueOn = addDays(startOn, Math.floor((365 / 4) * v));
      if (dueOn > endOn) break;
      const past = dueOn < addDays(today, -3);
      const overdue = !past && dueOn < today;
      await db.insert(s.serviceVisits).values({
        installationId: c.installationId, contractId: k.id, type: "amc", technicianId: tech.id, dueOn,
        status: past ? "done" : "scheduled",
        doneAt: past ? at(dueOn, 14 * 60) : null,
        notes: past ? "Routine service. TDS and pressure normal." : overdue ? null : null,
        partsUsed: past && v % 2 === 0 ? [{ name: "Micron filter 20\"", qty: 2 }] : null,
        nextDueOn: past ? addDays(dueOn, 91) : null,
      });
    }
  }

  // ── Complaints ──
  const cmp = (i: number) => `CMP-${today.slice(2, 4)}${today.slice(5, 7)}${today.slice(8, 10)}-${String(i).padStart(3, "0")}`;
  const [c1] = await db.insert(s.complaints).values({ ticketNo: cmp(1), installationId: clientsMade[2].installationId, clientId: clientsMade[2].id, issue: "Low output and high TDS since yesterday.", priority: "high", status: "open", dueBy: new Date(Date.now() + 24 * 3600_000), createdBy: adminId }).$returningId();
  const [c2] = await db.insert(s.complaints).values({ ticketNo: cmp(2), installationId: clientsMade[3].installationId, clientId: clientsMade[3].id, issue: "High pressure pump making noise.", priority: "urgent", status: "assigned", assignedTo: techs[1].id, dueBy: new Date(Date.now() - 2 * 3600_000), createdBy: adminId }).$returningId();
  await db.insert(s.serviceVisits).values({ installationId: clientsMade[3].installationId, complaintId: c2.id, type: "complaint", technicianId: techs[1].id, dueOn: today, status: "scheduled" });
  await db.insert(s.complaints).values({ ticketNo: cmp(3), installationId: clientsMade[6].installationId, clientId: clientsMade[6].id, issue: "Water leakage near the pre-filter housing.", priority: "normal", status: "resolved", assignedTo: techs[2].id, resolvedAt: new Date(Date.now() - 86_400_000), resolutionNotes: "Replaced O-ring and tightened housing.", createdBy: adminId });

  // ── Field visits (today + yesterday) ──
  const purposes: s.VisitPurpose[] = ["sales_pitch", "demo", "follow_up", "payment_collection"];
  const outcomes: s.VisitOutcome[] = ["interested", "quotation_requested", "revisit", "order_won", "not_interested"];
  for (const [di, date] of [addDays(today, -1), today].entries()) {
    for (const p of sales) {
      let minute = 10 * 60 + between(0, 40);
      const stops = date === today ? between(2, 4) : between(3, 5);
      for (let k = 0; k < stops; k++) {
        const prospect = rand() < 0.3;
        const c = pick(clientsMade);
        const far = !prospect && rand() < 0.12;
        const lat = (prospect ? OFFICE.lat + (rand() - 0.5) * 0.15 : c.lat) + (far ? 0.01 : (rand() - 0.5) * 0.001);
        const lng = (prospect ? OFFICE.lng + (rand() - 0.5) * 0.15 : c.lng) + (far ? 0.01 : (rand() - 0.5) * 0.001);
        const status: s.VisitStatus = di === 0 ? (rand() < 0.85 ? "verified" : "rejected") : "pending";
        const [fv] = await db.insert(s.fieldVisits).values({
          employeeId: p.id, clientId: prospect ? null : c.id, siteId: prospect ? null : c.siteId,
          prospectName: prospect ? pick(["Balaji Caterers", "Shree Ram Hostel", "Om Sai Restaurant", "Bharat Steels"]) : null,
          prospectPhone: prospect ? `+91970000${between(1000, 9999)}` : null,
          purpose: pick(purposes), contactName: prospect ? "Owner" : "Facility Manager", notes: pick(["Discussed 1000 LPH plant.", "Shared brochure and pricing.", "Collected cheque for AMC.", "Wants demo next week.", "Checked plant performance with client."]),
          outcome: pick(outcomes), loggedAt: at(date, minute), lat, lng, accuracyM: between(5, 40),
          distanceFromSiteM: prospect ? null : far ? 1400 : between(5, 120), flags: far ? { farFromSite: true } : null,
          status, reviewedBy: status === "pending" ? null : adminId, reviewedAt: status === "pending" ? null : new Date(),
          reviewRemark: status === "rejected" ? "Location does not match the client site." : null,
        }).$returningId();
        if (k === 0 && di === 1) {
          await db.insert(s.followUps).values({ fieldVisitId: fv.id, employeeId: p.id, clientId: prospect ? null : c.id, dueOn: addDays(today, between(0, 3)), note: "Send revised quotation" });
        }
        minute += between(45, 110);
      }
    }
  }

  // ── SMS templates + demo history ──
  await db.insert(s.smsTemplates).values(TEMPLATES);
  const tpl = Object.fromEntries((await db.select().from(s.smsTemplates)).map((t) => [t.key, t]));
  const history: (typeof s.smsMessages.$inferInsert)[] = [];
  for (const [i, c] of clientsMade.entries()) {
    const sentAt = at(addDays(today, -between(0, 6)), 9 * 60 + between(0, 5));
    const failed = i === 4;
    history.push({
      templateId: tpl.service_due.id, clientId: c.id, contactId: c.contactId, phone: c.phone,
      body: tpl.service_due.body.replace("{{client}}", c.name).replace("{{date}}", addDays(today, 7)),
      refType: "service_visit", provider: "demo", status: failed ? "failed" : "delivered",
      error: failed ? "Simulated delivery failure (demo)" : null, attempts: 1, scheduledAt: sentAt, sentAt,
      deliveredAt: failed ? null : new Date(sentAt.getTime() + 2000), providerMsgId: failed ? null : `demo_seed_${i}`,
    });
  }
  history.push({
    templateId: tpl.complaint_received.id, clientId: clientsMade[2].id, contactId: clientsMade[2].contactId, phone: clientsMade[2].phone,
    body: tpl.complaint_received.body.replace("{{client}}", clientsMade[2].name).replace("{{ticket}}", cmp(1)),
    refType: "complaint", refId: c1.id, provider: "demo", status: "delivered", attempts: 1,
    scheduledAt: new Date(), sentAt: new Date(), deliveredAt: new Date(Date.now() + 2000), providerMsgId: "demo_seed_cmp",
  });
  await db.insert(s.smsMessages).values(history);

  console.log(`✓ Demo data: ${staff.length} staff (password = SEED_DEMO_PASSWORD), ${rows.length} attendance rows, ${clientsMade.length} clients, AMC contracts, service & field visits, ${TEMPLATES.length} SMS templates.`);
  console.log(`  Demo logins: mobiles +919810000002 … +919810000${String(n - 1).padStart(3, "0")} (e.g. 9810000008 = Ravi Kumar, sales; 9810000011 = Amit Patel, technician).`);
}

async function main() {
  if (!process.env.DB_HOST || !process.env.DB_NAME) {
    throw new Error("Fill the DB_* values in .env and run `npm run db:migrate` first.");
  }
  const adminId = await seedAdmin();
  // Make sure SMS templates exist even without demo data.
  if (!DEMO && !(await db.query.smsTemplates.findFirst({ columns: { id: true } }))) {
    await db.insert(s.smsTemplates).values(TEMPLATES);
    console.log(`✓ Added ${TEMPLATES.length} SMS templates.`);
  }
  if (DEMO) await seedDemo(adminId);
}

main()
  .catch((e) => {
    console.error("✗", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
