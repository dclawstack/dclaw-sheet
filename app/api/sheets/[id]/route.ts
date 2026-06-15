import { ok, fail, requireDb } from "@/lib/api";
import { currentPrincipal } from "@/lib/auth";
import { getSheetScoped, getCells, deleteSheet } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  const guard = requireDb();
  if (guard) return guard;
  const { workspaceId } = await currentPrincipal();
  const sheet = await getSheetScoped(workspaceId, params.id);
  if (!sheet) return fail("Sheet not found", 404);
  const cells = await getCells(sheet.id);
  return ok({ sheet, cells });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const guard = requireDb();
  if (guard) return guard;
  const { workspaceId } = await currentPrincipal();
  const deleted = await deleteSheet(workspaceId, params.id);
  return deleted ? ok({ deleted: true }) : fail("Sheet not found", 404);
}
