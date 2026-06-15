import { z } from "zod";
import { ok, fail, requireDb, parseBody } from "@/lib/api";
import { currentPrincipal } from "@/lib/auth";
import { getConnection } from "@/lib/queries";
import { syncConnection } from "@/lib/connector-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: { id: string } };

const Schema = z.object({ workbookId: z.string().uuid().optional() });

export async function POST(req: Request, { params }: Ctx) {
  const guard = requireDb();
  if (guard) return guard;
  const parsed = await parseBody(req, Schema.optional().default({}));
  if ("error" in parsed) return parsed.error;
  const { workspaceId } = await currentPrincipal();
  const conn = await getConnection(workspaceId, params.id);
  if (!conn) return fail("Connection not found", 404);

  try {
    const result = await syncConnection(workspaceId, conn, parsed.data?.workbookId);
    return ok(result);
  } catch (e: any) {
    return fail(String(e?.message ?? e), 502);
  }
}
