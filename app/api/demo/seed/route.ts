import { ok, fail, requireDb } from "@/lib/api";
import { currentPrincipal } from "@/lib/auth";
import { createConnection, getConnection } from "@/lib/queries";
import { encryptJson } from "@/lib/crypto";
import { syncConnection } from "@/lib/connector-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * One-click demo: create a Stripe connection (synthetic, key-free) and sync it
 * into a fresh "Stripe Demo" workbook. This is the time-to-first-value path —
 * a user can ask the copilot "MRR by month" within seconds of signing up.
 */
export async function POST() {
  const guard = requireDb();
  if (guard) return guard;
  const { workspaceId } = await currentPrincipal();

  const conn = await createConnection(workspaceId, "Stripe Demo", "stripe", encryptJson({ kind: "stripe" }));
  const full = await getConnection(workspaceId, conn.id);
  if (!full) return fail("seed failed", 500);

  const result = await syncConnection(workspaceId, full);
  return ok({ workbookId: result.workbookId, sheetId: result.sheetId, rows: result.rows }, { status: 201 });
}
