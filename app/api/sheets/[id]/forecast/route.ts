import { z } from "zod";
import { ok, fail, requireDb, parseBody } from "@/lib/api";
import { currentPrincipal } from "@/lib/auth";
import { getSheetScoped, getCells } from "@/lib/queries";
import { buildRecords } from "@/lib/sheet-data";
import { forecast, anomalies } from "@/lib/forecast";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

const Schema = z.object({
  column: z.string().min(1),
  periods: z.number().int().min(1).max(60).optional(),
  seasonLength: z.number().int().min(0).max(24).optional(),
});

export async function POST(req: Request, { params }: Ctx) {
  const guard = requireDb();
  if (guard) return guard;
  const parsed = await parseBody(req, Schema);
  if ("error" in parsed) return parsed.error;
  const { workspaceId } = await currentPrincipal();
  const sheet = await getSheetScoped(workspaceId, params.id);
  if (!sheet) return fail("Sheet not found", 404);

  const { rows } = buildRecords(await getCells(sheet.id));
  const series = rows.map((r) => Number(r[parsed.data.column])).filter((v) => Number.isFinite(v));
  if (series.length < 3) return fail("Need at least 3 numeric points in that column", 422);

  const periods = parsed.data.periods ?? 6;
  const seasonLength = parsed.data.seasonLength ?? 0;
  return ok({ ...forecast(series, periods, seasonLength), anomalies: anomalies(series) });
}
