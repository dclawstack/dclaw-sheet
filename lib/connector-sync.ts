import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { dictionaryEntries } from "@/db/schema";
import {
  createSheet,
  createWorkbook,
  replaceSheetCells,
  setConnectionStatus,
} from "@/lib/queries";
import { recordsToCells } from "@/lib/sheet-data";
import { decryptJson } from "@/lib/crypto";
import {
  fetchConnectorData,
  detectDrift,
  type ConnectorConfig,
  type Drift,
  type SourceColumn,
} from "@/lib/connectors";
import { emit } from "@/lib/telemetry";

export interface SyncResult {
  sheetId: string;
  workbookId: string;
  rows: number;
  drift: Drift;
  note?: string;
}

async function priorSchema(connectionId: string): Promise<SourceColumn[] | null> {
  const rows = await getDb()
    .select({ name: dictionaryEntries.columnName, dtype: dictionaryEntries.dtype })
    .from(dictionaryEntries)
    .where(eq(dictionaryEntries.connectionId, connectionId));
  return rows.length ? rows.map((r) => ({ name: r.name, dtype: r.dtype })) : null;
}

async function persistDictionary(
  workspaceId: string,
  connectionId: string,
  schema: SourceColumn[],
  rowsSample: Record<string, unknown>[]
) {
  const db = getDb();
  await db.delete(dictionaryEntries).where(eq(dictionaryEntries.connectionId, connectionId));
  if (schema.length === 0) return;
  await db.insert(dictionaryEntries).values(
    schema.map((c) => ({
      workspaceId,
      connectionId,
      tableName: "sheet",
      columnName: c.name,
      dtype: c.dtype,
      samples: rowsSample.slice(0, 3).map((r) => r[c.name]),
    }))
  );
}

/** Fetch a connection's data, write it to a fresh sheet, detect drift, refresh dictionary. */
export async function syncConnection(
  workspaceId: string,
  connection: { id: string; name: string; kind: string; configEncrypted: string },
  workbookId?: string
): Promise<SyncResult> {
  await setConnectionStatus(connection.id, { status: "syncing", lastError: null });
  try {
    const config = decryptJson<ConnectorConfig>(connection.configEncrypted);
    const data = await fetchConnectorData(config);

    const prev = await priorSchema(connection.id);
    const drift = detectDrift(prev, data.schema);

    let wbId = workbookId;
    if (!wbId) {
      const wb = await createWorkbook(workspaceId, connection.name);
      wbId = wb.id;
    }
    const sheet = await createSheet(workspaceId, wbId, `${connection.name} (synced)`);
    if (!sheet) throw new Error("target workbook not found");

    await replaceSheetCells(sheet.id, recordsToCells(data.headers, data.rows));
    await persistDictionary(workspaceId, connection.id, data.schema, data.rows);
    await setConnectionStatus(connection.id, { status: "ok", lastSyncedAt: new Date(), lastError: null });

    emit("connection.synced", {
      workspaceId,
      sheetId: sheet.id,
      payload: { kind: connection.kind, rows: data.rows.length, drift, note: data.note },
    });

    return { sheetId: sheet.id, workbookId: wbId, rows: data.rows.length, drift, note: data.note };
  } catch (e: any) {
    await setConnectionStatus(connection.id, { status: "error", lastError: String(e?.message ?? e) });
    throw e;
  }
}
