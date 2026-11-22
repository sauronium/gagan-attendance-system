import "server-only";

import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";

import { createQueryApi } from "./relational";
import * as schema from "./schema";

// One shared connection pool per server process. In development, Next.js
// hot reload re-runs this module, so the pool is cached on globalThis to
// avoid opening a new set of connections on every change (important on
// Hostinger, which limits concurrent MySQL connections).
const globalForDb = globalThis as unknown as { mysqlPool?: mysql.Pool };

const pool =
  globalForDb.mysqlPool ??
  mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 10,
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
