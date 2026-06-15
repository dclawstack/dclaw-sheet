import { z } from "zod";
import { ok, fail, requireDb, parseBody } from "@/lib/api";
import { currentPrincipal } from "@/lib/auth";
import { getSheetScoped, getCells } from "@/lib/queries";
import { buildSchema } from "@/lib/sheet-data";
import { runCopilot } from "@/lib/ai/copilot";
import { aiEnabled } from "@/lib/env";
import { emit } from "@/lib/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Schema = z.object({ sheetId: z.string().uuid(), question: z.string().min(1).max(2000) });

export async function POST(req: Request) {
  if (!aiEnabled()) return fail("AI not configured — add OPENROUTER_API_KEY (see SETUP-KEYS.md)", 503);
  const guard = requireDb();
  if (guard) return guard;
  const parsed = await parseBody(req, Schema);
  if ("error" in parsed) return parsed.error;

  const { workspaceId, userId } = await currentPrincipal();
  const sheet = await getSheetScoped(workspaceId, parsed.data.sheetId);
  if (!sheet) return fail("Sheet not found", 404);

  const schema = buildSchema(await getCells(sheet.id));
  const result = await runCopilot(parsed.data.question, schema, workspaceId);

  emit("copilot.asked", {
    workspaceId,
    userId,
    sheetId: sheet.id,
    payload: { question: parsed.data.question, tools: result.toolCalls.map((t) => t.tool), costUsd: result.costUsd },
  });

  if (!result.ok) return fail(result.error ?? "copilot failed", 502);
  return ok(result);
}
