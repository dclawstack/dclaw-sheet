import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";
import { requireDatabaseUrl } from "@/lib/env";

// Neon HTTP driver — ideal for Vercel serverless (no connection pooling headaches).
// Lazily constructed so the app can boot for pure-UI work before DATABASE_URL is set.
let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (_db) return _db;
  const sql = neon(requireDatabaseUrl());
  _db = drizzle(sql, { schema });
  return _db;
}

export type DB = ReturnType<typeof getDb>;
export { schema };
