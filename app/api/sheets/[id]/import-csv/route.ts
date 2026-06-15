import { z } from "zod";
import { ok, fail, requireDb, parseBody } from "@/lib/api";
import { currentPrincipal } from "@/lib/auth";
import { getSheetScoped, replaceSheetCells, type CellInput } from "@/lib/queries";
import { parseCsv, inferDtype } from "@/lib/csv";
import { emit } from "@/lib/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Ctx = { params: { id: string } };

const ImportSchema = z.object({
  csv: z.string().min(1).max(5_000_000),
  hasHeader: z.boolean().default(true),
});

export async function POST(req: Request, { params }: Ctx) {
  const guard = requireDb();
  if (guard) return guard;
  const parsed = await parseBody(req, ImportSchema);
  if ("error" in parsed) return parsed.error;
  const { workspaceId, userId } = await currentPrincipal();
  const sheet = await getSheetScoped(workspaceId, params.id);
  if (!sheet) return fail("Sheet not found", 404);

  const rows = parseCsv(parsed.data.csv);
  if (rows.length === 0) return fail("CSV had no rows", 422);

  const maxCols = Math.max(...rows.map((r) => r.length));
  if (rows.length > 100_000) return fail("CSV too large (>100k rows)", 422);

  const items: CellInput[] = [];
  rows.forEach((r, rowIdx) => {
    for (let col = 0; col < maxCols; col++) {
      const raw = r[col] ?? "";
      if (raw === "") continue;
      const isHeader = parsed.data.hasHeader && rowIdx === 0;
      items.push({
        row: rowIdx,
        col,
        raw,
        value: raw,
        dtype: isHeader ? "string" : inferDtype(raw),
      });
    }
  });

  await replaceSheetCells(sheet.id, items);
  const result = { rows: rows.length, cols: maxCols, cells: items.length };
  emit("csv.imported", { workspaceId, userId, sheetId: sheet.id, payload: result });
  return ok(result);
}
