import { getDb } from "@/db/client";
import { events } from "@/db/schema";
import { dbEnabled } from "@/lib/env";

interface EmitArgs {
  workspaceId?: string | null;
  userId?: string | null;
  workbookId?: string | null;
  sheetId?: string | null;
  payload?: Record<string, unknown>;
}

/** Fire-and-forget telemetry. Never throws — telemetry must not break a request. */
export function emit(eventType: string, args: EmitArgs = {}): void {
  if (!dbEnabled()) return;
  void (async () => {
    try {
      await getDb()
        .insert(events)
        .values({
          eventType,
          workspaceId: args.workspaceId ?? null,
          userId: args.userId ?? null,
          workbookId: args.workbookId ?? null,
          sheetId: args.sheetId ?? null,
          payload: args.payload ?? {},
        });
    } catch {
      /* swallow */
    }
  })();
}
