import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { cells, connections, sheets, workbooks } from "@/db/schema";

// ── Workbooks ────────────────────────────────────────────────────────────────
export async function listWorkbooks(workspaceId: string) {
  return getDb()
    .select()
    .from(workbooks)
    .where(eq(workbooks.workspaceId, workspaceId))
    .orderBy(asc(workbooks.createdAt));
}

export async function createWorkbook(workspaceId: string, name: string) {
  const [wb] = await getDb().insert(workbooks).values({ workspaceId, name }).returning();
  // every workbook starts with one sheet
  await getDb().insert(sheets).values({ workbookId: wb.id, name: "Sheet1", position: 0 });
  return wb;
}

export async function getWorkbook(workspaceId: string, id: string) {
  const rows = await getDb()
    .select()
    .from(workbooks)
    .where(and(eq(workbooks.id, id), eq(workbooks.workspaceId, workspaceId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateWorkbook(workspaceId: string, id: string, name: string) {
  const [wb] = await getDb()
    .update(workbooks)
    .set({ name, updatedAt: new Date() })
    .where(and(eq(workbooks.id, id), eq(workbooks.workspaceId, workspaceId)))
    .returning();
  return wb ?? null;
}

export async function deleteWorkbook(workspaceId: string, id: string) {
  const res = await getDb()
    .delete(workbooks)
    .where(and(eq(workbooks.id, id), eq(workbooks.workspaceId, workspaceId)))
    .returning({ id: workbooks.id });
  return res.length > 0;
}

// ── Sheets (ownership verified through the parent workbook) ──────────────────
export async function listSheets(workspaceId: string, workbookId: string) {
  const wb = await getWorkbook(workspaceId, workbookId);
  if (!wb) return null;
  return getDb().select().from(sheets).where(eq(sheets.workbookId, workbookId)).orderBy(asc(sheets.position));
}

export async function getSheetScoped(workspaceId: string, sheetId: string) {
  const rows = await getDb()
    .select({ sheet: sheets, workspaceId: workbooks.workspaceId })
    .from(sheets)
    .innerJoin(workbooks, eq(sheets.workbookId, workbooks.id))
    .where(and(eq(sheets.id, sheetId), eq(workbooks.workspaceId, workspaceId)))
    .limit(1);
  return rows[0]?.sheet ?? null;
}

export async function createSheet(workspaceId: string, workbookId: string, name: string) {
  const wb = await getWorkbook(workspaceId, workbookId);
  if (!wb) return null;
  const existing = await getDb().select().from(sheets).where(eq(sheets.workbookId, workbookId));
  const [s] = await getDb()
    .insert(sheets)
    .values({ workbookId, name, position: existing.length })
    .returning();
  return s;
}

export async function deleteSheet(workspaceId: string, sheetId: string) {
  const s = await getSheetScoped(workspaceId, sheetId);
  if (!s) return false;
  await getDb().delete(sheets).where(eq(sheets.id, sheetId));
  return true;
}

// ── Cells ────────────────────────────────────────────────────────────────────
export async function getCells(sheetId: string) {
  return getDb().select().from(cells).where(eq(cells.sheetId, sheetId)).orderBy(asc(cells.row), asc(cells.col));
}

export interface CellInput {
  row: number;
  col: number;
  raw: string | null;
  value: string | null;
  dtype?: string;
}

/** Upsert a batch of cells; empty raw deletes the cell (sparse storage). */
export async function bulkUpsertCells(sheetId: string, items: CellInput[]) {
  const db = getDb();
  const toDelete = items.filter((c) => c.raw === null || c.raw === "");
  const toUpsert = items.filter((c) => c.raw !== null && c.raw !== "");

  if (toDelete.length > 0) {
    // delete by coordinate pairs
    for (const c of toDelete) {
      await db
        .delete(cells)
        .where(and(eq(cells.sheetId, sheetId), eq(cells.row, c.row), eq(cells.col, c.col)));
    }
  }

  for (const c of toUpsert) {
    await db
      .insert(cells)
      .values({
        sheetId,
        row: c.row,
        col: c.col,
        raw: c.raw,
        value: c.value,
        dtype: c.dtype ?? "string",
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [cells.sheetId, cells.row, cells.col],
        set: { raw: c.raw, value: c.value, dtype: c.dtype ?? "string", updatedAt: new Date() },
      });
  }
  return { upserted: toUpsert.length, deleted: toDelete.length };
}

// ── Connections ──────────────────────────────────────────────────────────────
export async function listConnections(workspaceId: string) {
  return getDb()
    .select({
      id: connections.id,
      name: connections.name,
      kind: connections.kind,
      status: connections.status,
      lastError: connections.lastError,
      lastSyncedAt: connections.lastSyncedAt,
      createdAt: connections.createdAt,
    })
    .from(connections)
    .where(eq(connections.workspaceId, workspaceId))
    .orderBy(desc(connections.createdAt));
}

export async function createConnection(
  workspaceId: string,
  name: string,
  kind: string,
  configEncrypted: string
) {
  const [c] = await getDb()
    .insert(connections)
    .values({ workspaceId, name, kind, configEncrypted })
    .returning();
  return c;
}

export async function getConnection(workspaceId: string, id: string) {
  const rows = await getDb()
    .select()
    .from(connections)
    .where(and(eq(connections.id, id), eq(connections.workspaceId, workspaceId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function setConnectionStatus(
  id: string,
  patch: { status?: string; lastError?: string | null; lastSyncedAt?: Date }
) {
  await getDb().update(connections).set(patch).where(eq(connections.id, id));
}

export async function clearSheetCells(sheetId: string) {
  await getDb().delete(cells).where(eq(cells.sheetId, sheetId));
}

export async function replaceSheetCells(sheetId: string, items: CellInput[]) {
  await clearSheetCells(sheetId);
  if (items.length === 0) return { inserted: 0 };
  const db = getDb();
  const CHUNK = 500;
  for (let i = 0; i < items.length; i += CHUNK) {
    const batch = items.slice(i, i + CHUNK).map((c) => ({
      sheetId,
      row: c.row,
      col: c.col,
      raw: c.raw,
      value: c.value,
      dtype: c.dtype ?? "string",
    }));
    await db.insert(cells).values(batch);
  }
  return { inserted: items.length };
}

export { inArray };
