import { z } from "zod";
import { ok, fail, requireDb, parseBody } from "@/lib/api";
import { currentPrincipal } from "@/lib/auth";
import { getSheetScoped, getCells, bulkUpsertCells } from "@/lib/queries";
import { emit } from "@/lib/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  const guard = requireDb();
  if (guard) return guard;
  const { workspaceId } = await currentPrincipal();
  const sheet = await getSheetScoped(workspaceId, params.id);
  if (!sheet) return fail("Sheet not found", 404);
  return ok(await getCells(sheet.id));
}

const CellSchema = z.object({
  row: z.number().int().min(0),
  col: z.number().int().min(0),
  raw: z.string().nullable(),
  value: z.string().nullable(),
  dtype: z.string().optional(),
});
const PutSchema = z.object({ cells: z.array(CellSchema).max(5000) });

export async function PUT(req: Request, { params }: Ctx) {
  const guard = requireDb();
  if (guard) return guard;
  const parsed = await parseBody(req, PutSchema);
  if ("error" in parsed) return parsed.error;
  const { workspaceId, userId } = await currentPrincipal();
  const sheet = await getSheetScoped(workspaceId, params.id);
  if (!sheet) return fail("Sheet not found", 404);
  const res = await bulkUpsertCells(sheet.id, parsed.data.cells);
  emit("cells.updated", { workspaceId, userId, sheetId: sheet.id, payload: res });
  return ok(res);
}
