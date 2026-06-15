import { z } from "zod";
import { ok, fail, requireDb, parseBody } from "@/lib/api";
import { currentPrincipal } from "@/lib/auth";
import { getSheetScoped, getCells } from "@/lib/queries";
import { buildSchema } from "@/lib/sheet-data";
import { generateSql } from "@/lib/ai/sql";
import { aiEnabled } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Schema = z.object({ sheetId: z.string().uuid(), question: z.string().min(1).max(2000) });

export async function POST(req: Request) {
  if (!aiEnabled()) return fail("AI not configured — add OPENROUTER_API_KEY", 503);
  const guard = requireDb();
  if (guard) return guard;
  const parsed = await parseBody(req, Schema);
  if ("error" in parsed) return parsed.error;

  const { workspaceId } = await currentPrincipal();
  const sheet = await getSheetScoped(workspaceId, parsed.data.sheetId);
  if (!sheet) return fail("Sheet not found", 404);

  const schema = buildSchema(await getCells(sheet.id));
  const result = await generateSql(parsed.data.question, schema, workspaceId);
  if (!result.ok) return fail(result.error ?? "SQL generation failed", 502);
  return ok(result);
}
