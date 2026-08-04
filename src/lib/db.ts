import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Hosted Postgres (Neon or any provider with an HTTP driver compatible URL).
// The whitespace strip matters: connection strings pasted into dashboards
// sometimes pick up invisible whitespace that breaks auth.
const url = (process.env.DATABASE_URL ?? "").replace(/\s+/g, "");
if (!url) throw new Error("DATABASE_URL is not set.");

const globalForDb = globalThis as unknown as { __linkagentDb?: ReturnType<typeof createDb> };

function createDb() {
  const sql = neon(url);
  return drizzle(sql, { schema });
}

export const db = globalForDb.__linkagentDb ?? createDb();
if (process.env.NODE_ENV !== "production") globalForDb.__linkagentDb = db;

export * from "./schema";
