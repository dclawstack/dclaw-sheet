import { z } from "zod";
import { ok, fail, requireDb, parseBody } from "@/lib/api";
import { currentPrincipal } from "@/lib/auth";
import { getWorkbook, updateWorkbook, deleteWorkbook } from "@/lib/queries";
import { emit } from "@/lib/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  const guard = requireDb();
  if (guard) return guard;
  const { workspaceId } = await currentPrincipal();
  const wb = await getWorkbook(workspaceId, params.id);
  return wb ? ok(wb) : fail("Workbook not found", 404);
}

const PatchSchema = z.object({ name: z.string().min(1).max(200) });

export async function PATCH(req: Request, { params }: Ctx) {
  const guard = requireDb();
  if (guard) return guard;
  const parsed = await parseBody(req, PatchSchema);
  if ("error" in parsed) return parsed.error;
  const { workspaceId } = await currentPrincipal();
  const wb = await updateWorkbook(workspaceId, params.id, parsed.data.name);
  return wb ? ok(wb) : fail("Workbook not found", 404);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const guard = requireDb();
  if (guard) return guard;
  const { workspaceId, userId } = await currentPrincipal();
  const deleted = await deleteWorkbook(workspaceId, params.id);
  if (!deleted) return fail("Workbook not found", 404);
  emit("workbook.deleted", { workspaceId, userId, workbookId: params.id });
  return ok({ deleted: true });
}
