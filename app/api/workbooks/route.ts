import { z } from "zod";
import { ok, fail, requireDb, parseBody } from "@/lib/api";
import { currentPrincipal } from "@/lib/auth";
import { listWorkbooks, createWorkbook } from "@/lib/queries";
import { emit } from "@/lib/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = requireDb();
  if (guard) return guard;
  const { workspaceId } = await currentPrincipal();
  return ok(await listWorkbooks(workspaceId));
}

const CreateSchema = z.object({ name: z.string().min(1).max(200) });

export async function POST(req: Request) {
  const guard = requireDb();
  if (guard) return guard;
  const parsed = await parseBody(req, CreateSchema);
  if ("error" in parsed) return parsed.error;
  const { workspaceId, userId } = await currentPrincipal();
  const wb = await createWorkbook(workspaceId, parsed.data.name);
  emit("workbook.created", { workspaceId, userId, workbookId: wb.id, payload: { name: wb.name } });
  return ok(wb, { status: 201 });
}
