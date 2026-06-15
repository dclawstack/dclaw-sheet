import { z } from "zod";
import { ok, fail, requireDb, parseBody } from "@/lib/api";
import { currentPrincipal } from "@/lib/auth";
import { listConnections, createConnection } from "@/lib/queries";
import { encryptJson } from "@/lib/crypto";
import { emit } from "@/lib/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = requireDb();
  if (guard) return guard;
  const { workspaceId } = await currentPrincipal();
  return ok(await listConnections(workspaceId));
}

const ConfigSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("stripe"), apiKey: z.string().optional() }),
  z.object({ kind: z.literal("csv_url"), url: z.string().url(), hasHeader: z.boolean().optional() }),
  z.object({ kind: z.literal("postgres"), connectionString: z.string().min(1), query: z.string().min(1) }),
]);
const CreateSchema = z.object({ name: z.string().min(1).max(120), config: ConfigSchema });

export async function POST(req: Request) {
  const guard = requireDb();
  if (guard) return guard;
  const parsed = await parseBody(req, CreateSchema);
  if ("error" in parsed) return parsed.error;
  const { workspaceId } = await currentPrincipal();
  const c = await createConnection(
    workspaceId,
    parsed.data.name,
    parsed.data.config.kind,
    encryptJson(parsed.data.config)
  );
  emit("connection.created", { workspaceId, payload: { kind: c.kind } });
  // never return the encrypted config
  return ok({ id: c.id, name: c.name, kind: c.kind, status: c.status }, { status: 201 });
}
