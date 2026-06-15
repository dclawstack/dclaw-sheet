import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users, workspaces } from "@/db/schema";
import { env } from "@/lib/env";

export interface Principal {
  workspaceId: string;
  userId: string;
  email: string;
}

let devCache: Principal | null = null;

/**
 * Resolve the caller's workspace + user. In dev mode we auto-provision a single
 * default workspace/user (zero-config local). Clerk wiring lands in M5.
 */
export async function currentPrincipal(): Promise<Principal> {
  if (env.AUTH_PROVIDER === "dev") {
    if (devCache) return devCache;
    const db = getDb();

    const existing = await db.select().from(users).where(eq(users.email, env.DEV_USER_EMAIL)).limit(1);
    if (existing.length > 0) {
      const u = existing[0];
      devCache = { workspaceId: u.workspaceId, userId: u.id, email: u.email };
      return devCache;
    }

    const [ws] = await db.insert(workspaces).values({ name: env.DEV_WORKSPACE }).returning();
    const [u] = await db
      .insert(users)
      .values({ workspaceId: ws.id, email: env.DEV_USER_EMAIL, name: "Dev User" })
      .returning();
    devCache = { workspaceId: ws.id, userId: u.id, email: u.email };
    return devCache;
  }

  // clerk provider — implemented in M5; fail loudly until then.
  throw new Error(`AUTH_PROVIDER=${env.AUTH_PROVIDER} not yet implemented`);
}
