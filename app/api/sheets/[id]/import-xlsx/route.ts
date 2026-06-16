import { fail, requireDb, ok } from "@/lib/api";
import { currentPrincipal } from "@/lib/auth";
import { getSheetScoped, replaceSheetCells } from "@/lib/queries";
import { parseXlsx } from "@/lib/xlsx";
import { emit } from "@/lib/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Ctx = { params: { id: string } };

export async function POST(req: Request, { params }: Ctx) {
  const guard = requireDb();
  if (guard) return guard;
  const { workspaceId, userId } = await currentPrincipal();
  const sheet = await getSheetScoped(workspaceId, params.id);
  if (!sheet) return fail("Sheet not found", 404);

  let file: File | null = null;
  try {
    const form = await req.formData();
    file = form.get("file") as File | null;
  } catch {
    return fail("Expected multipart/form-data with a 'file' field", 400);
  }
  if (!file || typeof file.arrayBuffer !== "function") return fail("No file uploaded", 400);
  if (file.size > 10_000_000) return fail("File too large (>10MB)", 413);

  let parsed;
  try {
    parsed = await parseXlsx(await file.arrayBuffer());
  } catch (e: any) {
    return fail(`Could not parse XLSX: ${String(e?.message ?? e)}`, 422);
  }

  await replaceSheetCells(sheet.id, parsed.cells);
  const result = { cells: parsed.cells.length, source: parsed.name };
  emit("xlsx.imported", { workspaceId, userId, sheetId: sheet.id, payload: result });
  return ok(result);
}
