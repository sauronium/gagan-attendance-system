import { sql } from "drizzle-orm";
import { bigint, customType, datetime, decimal, varchar } from "drizzle-orm/mysql-core";

/**
 * JSON column that works on both MySQL and MariaDB. MySQL returns JSON
 * columns already parsed; MariaDB stores JSON as LONGTEXT and returns a
 * string, which Drizzle's built-in json() would pass through unparsed.
 * Use with `.$type<T>()` like the built-in.
 */
export const json = customType<{ data: unknown; driverData: string }>({
  dataType: () => "json",
  toDriver: (value) => JSON.stringify(value),
  fromDriver: (value) => (typeof value === "string" ? JSON.parse(value) : value),
});

// Shared column builders. Column names come from the property key,
// converted to snake_case (`casing: "snake_case"` in the Drizzle config
// and client), so `employeeId` becomes `employee_id` in MySQL.
//
// Conventions:
// - Primary keys are BIGINT UNSIGNED AUTO_INCREMENT (sequential, compact).
// - Points in time are DATETIME(3) stored in UTC. The server clock is the
//   only source of time for attendance and visits.
// - Calendar days (attendance day, leave dates, due dates) are DATE kept as
//   "YYYY-MM-DD" strings, so no timezone shift can move them.
// - Status-like fields are VARCHAR typed with a TypeScript union instead of
//   MySQL ENUM, so adding a value never needs an ALTER TABLE.

/** BIGINT UNSIGNED AUTO_INCREMENT primary key. */
export const id = () =>
  bigint({ mode: "number", unsigned: true }).autoincrement().primaryKey();

/** Holds another table's `id`. Add `.references()` at the call site. */
export const ref = () => bigint({ mode: "number", unsigned: true });

/** DATETIME(3), read and written as a JS Date in UTC. */
export const dateTime = () => datetime({ mode: "date", fsp: 3 });

/** created_at / updated_at pair. Spread into a table: `...timestamps()`. */
export const timestamps = () => ({
  createdAt: dateTime().notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  updatedAt: dateTime()
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(3)`)
    .$onUpdate(() => new Date()),
});

/** created_at only, for append-only tables (logs, adjustments). */
export const createdAt = () =>
  dateTime().notNull().default(sql`CURRENT_TIMESTAMP(3)`);

/** Latitude / longitude in degrees, ~1 cm precision. */
export const coordinate = () =>
  decimal({ precision: 10, scale: 7, mode: "number" });

/** Indian rupees, read as a string to avoid float rounding. */
export const money = () => decimal({ precision: 12, scale: 2 });

/** Leave days, allows halves and quarters (e.g. 1.25 monthly accrual). */
export const leaveDays = () =>
  decimal({ precision: 5, scale: 2, mode: "number" });

/** Phone number in E.164 form, e.g. +919812345678. */
export const phone = () => varchar({ length: 20 });

/** Cloudflare R2 object key for a stored file. */
export const fileKey = () => varchar({ length: 255 });
