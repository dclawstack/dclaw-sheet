import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";
import { dbEnabled } from "@/lib/env";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export function requireDb() {
  if (!dbEnabled()) {
    return fail(
      "Database not configured. Paste a Neon DATABASE_URL into .env.local (see SETUP-KEYS.md).",
      503
    );
  }
  return null;
}

/** Parse + validate a JSON request body against a Zod schema. */
export async function parseBody<T>(req: Request, schema: ZodSchema<T>): Promise<{ data: T } | { error: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { error: fail("Invalid JSON body") };
  }
  try {
    return { data: schema.parse(raw) };
  } catch (e) {
    if (e instanceof ZodError) {
      return { error: fail("Validation failed", 422, { issues: e.flatten() }) };
    }
    return { error: fail("Validation failed", 422) };
  }
}
