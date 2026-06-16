import { z } from "zod";
import { fail, requireDb, parseBody } from "@/lib/api";
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

/** Server-Sent Events copilot. Streams status while it plans + generates consensus SQL,
 *  then a single `plan` event the client executes (SQL runs in-browser DuckDB). */
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

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (obj: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
      try {
        const result = await runCopilot(parsed.data.question, schema, workspaceId, (m) =>
          send({ type: "status", message: m })
        );
        emit("copilot.asked", {
          workspaceId,
          userId,
          sheetId: sheet.id,
          payload: { question: parsed.data.question, tools: result.toolCalls.map((t) => t.tool), costUsd: result.costUsd, streamed: true },
        });
        if (!result.ok) send({ type: "error", error: result.error ?? "copilot failed" });
        else send({ type: "plan", plan: result });
      } catch (e: any) {
        send({ type: "error", error: String(e?.message ?? e) });
      } finally {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
