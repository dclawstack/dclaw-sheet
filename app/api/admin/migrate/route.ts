import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { getDb } from "@/db/client";
import { seedRoadmap } from "@/db/roadmap";
import { dbEnabled } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * One-time, token-guarded migration runner. DATABASE_URL is a sensitive Vercel env
 * (not exportable to a laptop), so migrations run here, inside the runtime that has it.
 * Requires header `x-migrate-token` === MIGRATE_TOKEN. Idempotent: Drizzle tracks
 * applied migrations; pgvector setup + roadmap seed use IF NOT EXISTS / upsert.
 */
export async function POST(req: Request) {
  const token = req.headers.get("x-migrate-token");
  if (!process.env.MIGRATE_TOKEN || token !== process.env.MIGRATE_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!dbEnabled()) return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 503 });

  const db = getDb();
  const steps: string[] = [];
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    steps.push("schema migrated");

    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
    await db.execute(sql`ALTER TABLE dictionary_entries ADD COLUMN IF NOT EXISTS embedding vector(1536)`);
    steps.push("pgvector ready");

    const n = await seedRoadmap(db);
    steps.push(`seeded ${n} roadmap items`);

    return NextResponse.json({ ok: true, steps });
  } catch (e: any) {
    return NextResponse.json({ ok: false, steps, error: String(e?.message ?? e) }, { status: 500 });
  }
}
