// DEMO — see lib/demo/seed-data.ts header for removal steps.
import { ok, requireDb } from "@/lib/api";
import { currentPrincipal } from "@/lib/auth";
import { clearAllData } from "@/lib/demo/seed-data";
import { emit } from "@/lib/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const guard = requireDb();
  if (guard) return guard;
  const { workspaceId } = await currentPrincipal();
  const result = await clearAllData(workspaceId);
  emit("demo.cleared", { workspaceId, payload: result });
  return ok(result);
}
