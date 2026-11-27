import "server-only";

import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";

import { createQueryApi } from "./relational";
import * as schema from "./schema";

// One shared connection pool per server process. In development, Next.js
// hot reload re-runs this module, so the pool is cached on globalThis to
// avoid opening a new set of connections on every change (important on
// Hostinger, which limits concurrent MySQL connections).
const globalForDb = globalThis as unknown as { mysqlPool?: mysql.Pool };

// On Vercel every function instance has its own pool, and Hostinger caps
// both concurrent connections and new connections per hour, so keep each
// instance's pool small there.
const onVercel = Boolean(process.env.VERCEL);

const pool =
  globalForDb.mysqlPool ??
  mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || (onVercel ? 3 : 10),
    waitForConnections: true,
    // Shared hosting closes idle connections quickly: keep them alive and
    // retire idle ones ourselves so requests never pick up a dead socket.
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
    maxIdle: 2,
    idleTimeout: 60_000,
    // Names and notes may contain Hindi or other non-Latin text.
    charset: "utf8mb4_unicode_ci",
    // Store and read DATETIME values as UTC; convert to IST only for display.
    timezone: "Z",
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.mysqlPool = pool;
}

// Vercel (Fluid compute) suspends idle function instances. This keeps an
// instance alive just long enough for its idle connections to close cleanly,
// so suspended instances don't leave connections open on Hostinger.
if (onVercel) attachDatabasePool(pool);

// `casing` must match drizzle.config.ts so query column names line up
// with the migrations.
const base = drizzle({
  client: pool,
  schema,
  mode: "default",
  casing: "snake_case",
});

// Hostinger runs MariaDB, which can't execute Drizzle's nested relational
// SQL. Swap db.query (and tx.query inside transactions) for a loader that
// uses plain SELECTs, keeping the same API and types. See ./relational.ts.
const ctx = {
  schema: base._.schema!,
  tableNamesMap: base._.tableNamesMap,
  fullSchema: base._.fullSchema as Record<string, unknown>,
};
type QueryApi = typeof base.query;
(base as { query: QueryApi }).query = createQueryApi<QueryApi>(base, ctx);
const runTransaction = base.transaction.bind(base);
(base as { transaction: typeof base.transaction }).transaction = ((fn, config) =>
  runTransaction((tx) => {
    (tx as { query: QueryApi }).query = createQueryApi<QueryApi>(tx, ctx);
    return fn(tx);
  }, config)) as typeof base.transaction;

export const db = base;
