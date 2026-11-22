import {
  boolean,
  index,
  mysqlTable,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

import { dateTime, timestamps } from "./columns";

// Better Auth tables (core schema + phone-number plugin), hand-written to
// match Better Auth 1.7. The export names (user, session, account,
// verification) are the model names Better Auth's Drizzle adapter looks up.
// MySQL table names are prefixed with auth_ to keep them apart from app data.
//
// After adding or changing Better Auth plugins, compare with
// `npx auth@latest generate` output and update this file.

/** A login. Linked 1:1 to an employee through employees.user_id. */
export const user = mysqlTable(
  "auth_users",
  {
    id: varchar({ length: 36 }).primaryKey(),
    name: varchar({ length: 191 }).notNull(),
    /** Required by Better Auth. Real email if known, else an internal placeholder. */
    email: varchar({ length: 191 }).notNull(),
    emailVerified: boolean().notNull().default(false),
    image: text(),
    /** phone-number plugin: staff sign in with mobile + password. */
    phoneNumber: varchar({ length: 20 }),
    phoneNumberVerified: boolean(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("auth_users_email_uq").on(t.email),
    uniqueIndex("auth_users_phone_number_uq").on(t.phoneNumber),
  ],
);

export const session = mysqlTable(
  "auth_sessions",
  {
    id: varchar({ length: 36 }).primaryKey(),
    expiresAt: dateTime().notNull(),
    token: varchar({ length: 255 }).notNull(),
    ipAddress: varchar({ length: 64 }),
    userAgent: text(),
    userId: varchar({ length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("auth_sessions_token_uq").on(t.token),
    index("auth_sessions_user_idx").on(t.userId),
  ],
);

/** Credentials (hashed password) and any future OAuth providers. */
export const account = mysqlTable(
  "auth_accounts",
  {
    id: varchar({ length: 36 }).primaryKey(),
    accountId: varchar({ length: 191 }).notNull(),
    providerId: varchar({ length: 64 }).notNull(),
    userId: varchar({ length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: dateTime(),
    refreshTokenExpiresAt: dateTime(),
    scope: text(),
    password: text(),
    ...timestamps(),
  },
  (t) => [index("auth_accounts_user_idx").on(t.userId)],
);

/** One-time codes (phone OTP, password reset). */
export const verification = mysqlTable(
  "auth_verifications",
  {
    id: varchar({ length: 36 }).primaryKey(),
    identifier: varchar({ length: 191 }).notNull(),
    value: text().notNull(),
    expiresAt: dateTime().notNull(),
    ...timestamps(),
  },
  (t) => [index("auth_verifications_identifier_idx").on(t.identifier)],
);
