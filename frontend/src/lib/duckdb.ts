"use client";

import { listCells, type Cell } from "@/lib/api";

/**
 * Load a sheet's data into an in-memory DuckDB-WASM database and return
 * a connection. The first row of the sheet becomes the table's column
 * headers (sanitised + uniquified); the remaining rows become typed values.
 *
 * Shared by the SQL panel (1.4) and the Pivot panel (2.10).
 */

export interface DuckDBHandle {
  conn: DuckDBConnection;
  headers: string[];
  rowCount: number;
  terminate: () => Promise<void>;
}

// Loose structural types so consumers don't have to pull in @duckdb types.
export interface DuckDBQueryResult {
  schema: { fields: { name: string }[] };
  toArray: () => Record<string, unknown>[];
}
export interface DuckDBConnection {
  query: (sql: string) => Promise<DuckDBQueryResult>;
  close: () => Promise<void>;
}

function coerceCell(c: Cell): string | number | boolean | null {
  if (c.value === null || c.value === "") return null;
  if (c.data_type === "number") {
    const n = Number(c.value);
    return Number.isFinite(n) ? n : c.value;
  }
  if (c.data_type === "boolean") return c.value.toUpperCase() === "TRUE";
  return c.value;
}

export function buildRecords(cells: Cell[]): {
  headers: string[];
  rows: Record<string, unknown>[];
} {
  if (cells.length === 0) return { headers: [], rows: [] };
  let maxRow = 0;
  let maxCol = 0;
  for (const c of cells) {
    if (c.row > maxRow) maxRow = c.row;
    if (c.column > maxCol) maxCol = c.column;
  }
  const grid: (Cell | undefined)[][] = Array.from(
    { length: maxRow + 1 },
    () => Array(maxCol + 1),
  );
  for (const c of cells) grid[c.row][c.column] = c;

  const headerCells = grid[0];
  const headers: string[] = [];
  for (let c = 0; c <= maxCol; c += 1) {
    const cell = headerCells?.[c];
    const fallback = `col${c}`;
    const raw =
      cell?.value && cell.value.trim() !== "" ? cell.value : fallback;
    let name = raw.replace(/[^A-Za-z0-9_]/g, "_");
    if (!/^[A-Za-z_]/.test(name)) name = `_${name}`;
    let unique = name;
    let suffix = 1;
    while (headers.includes(unique)) {
      unique = `${name}_${suffix}`;
      suffix += 1;
    }
    headers.push(unique);
  }

  const rows: Record<string, unknown>[] = [];
  for (let r = 1; r <= maxRow; r += 1) {
    const record: Record<string, unknown> = {};
    let any = false;
    for (let c = 0; c <= maxCol; c += 1) {
      const cell = grid[r]?.[c];
      const value = cell ? coerceCell(cell) : null;
      record[headers[c]] = value;
      if (value !== null) any = true;
    }
    if (any) rows.push(record);
  }
  return { headers, rows };
}

export async function loadDuckDBFromSheet(sheetId: string): Promise<DuckDBHandle> {
  const duckdb = await import("@duckdb/duckdb-wasm");
  const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
  const workerBlob = new Blob(
    [`importScripts("${bundle.mainWorker}");`],
    { type: "application/javascript" },
  );
  const worker = new Worker(URL.createObjectURL(workerBlob));
  const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  const conn = await db.connect();

  const cells = await listCells(sheetId);
  const { headers, rows } = buildRecords(cells);
  if (rows.length === 0) {
    await conn.query(`CREATE TABLE sheet (col TEXT);`);
  } else {
    await db.registerFileText("sheet.json", JSON.stringify(rows));
    await conn.query(
      `CREATE TABLE sheet AS SELECT * FROM read_json_auto('sheet.json');`,
    );
  }

  return {
    conn: conn as unknown as DuckDBConnection,
    headers,
    rowCount: rows.length,
    terminate: async () => {
      try {
        await conn.close();
      } catch {
        // swallow
      }
      try {
        await db.terminate();
      } catch {
        // swallow
      }
    },
  };
}

export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}
