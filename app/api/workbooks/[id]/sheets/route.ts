import { z } from "zod";
import { ok, fail, requireDb, parseBody } from "@/lib/api";
import { currentPrincipal } from "@/lib/auth";
import { listSheets, createSheet } from "@/lib/queries";
import { emit } from "@/lib/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  const guard = requireDb();
  if (guard) return guard;
  const { workspaceId } = await currentPrincipal();
  const rows = await listSheets(workspaceId, params.id);
  return rows ? ok(rows) : fail("Workbook not found", 404);
}

const CreateSchema = z.object({ name: z.string().min(1).max(120) });

export async function POST(req: Request, { params }: Ctx) {
  const guard = requireDb();
  if (guard) return guard;
  const parsed = await parseBody(req, CreateSchema);
  if ("error" in parsed) return parsed.error;
  const { workspaceId, userId } = await currentPrincipal();
  const s = await createSheet(workspaceId, params.id, parsed.data.name);
  if (!s) return fail("Workbook not found", 404);
  emit("sheet.created", { workspaceId, userId, workbookId: params.id, sheetId: s.id });
  return ok(s, { status: 201 });
}
