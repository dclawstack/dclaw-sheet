import { NextResponse } from "next/server";
import { aiEnabled, dbEnabled, env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let dbOk = false;
  let dbError: string | null = null;
  if (dbEnabled()) {
    try {
      const { getDb } = await import("@/db/client");
      const { _sql } = await import("@/db/schema");
      await getDb().execute(_sql`select 1`);
      dbOk = true;
    } catch (e: any) {
      dbError = String(e?.message ?? e);
    }
  }
  return NextResponse.json({
    status: "ok",
    env: env.APP_ENV,
    ai: { configured: aiEnabled() },
    db: { configured: dbEnabled(), reachable: dbOk, error: dbError },
  });
}
