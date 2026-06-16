import { fail, requireDb } from "@/lib/api";
import { currentPrincipal } from "@/lib/auth";
import { getSheetScoped, getCells } from "@/lib/queries";
import { buildXlsx, safeFilename } from "@/lib/xlsx";
import { emit } from "@/lib/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  const guard = requireDb();
  if (guard) return guard;
  const { workspaceId, userId } = await currentPrincipal();
  const sheet = await getSheetScoped(workspaceId, params.id);
  if (!sheet) return fail("Sheet not found", 404);

  const cells = await getCells(sheet.id);
  const buf = await buildXlsx(sheet.name, cells.map((c) => ({ row: c.row, col: c.col, raw: c.raw, value: c.value, dtype: c.dtype })));
  emit("sheet.exported", { workspaceId, userId, sheetId: sheet.id, payload: { cells: cells.length } });

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeFilename(sheet.name)}"`,
      "Cache-Control": "no-store",
    },
  });
}
