import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

// Load .env / .env.local the same way Next.js does, so drizzle-kit
// and the app always read the same database settings.
loadEnvConfig(process.cwd());

export default defineConfig({
  dialect: "mysql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  // camelCase keys in TypeScript ↔ snake_case columns in MySQL.
  // Must match the `casing` option in src/db/index.ts.
  casing: "snake_case",
  dbCredentials: {
    host: process.env.DB_HOST ?? "",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER ?? "",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "",
  },
  strict: true,
  verbose: true,
});
