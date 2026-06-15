"use client";

import { api } from "@/lib/client-api";
import { buildRecords } from "@/lib/sheet-data";
import type { Cell } from "@/lib/types";

export { buildRecords };

/**
 * Loads a sheet into an in-memory DuckDB-WASM database for OLAP-class SQL in the
 * browser. The first row becomes column headers (sanitised + uniquified); the rest
 * become typed rows. Shared by the SQL panel and the Pivot panel.
 *
 * DuckDB WASM is fetched from the jsDelivr CDN at runtime (no webpack wasm bundling).
 */

export interface DuckDBQueryResult {
  schema: { fields: { name: string }[] };
  toArray: () => Record<string, unknown>[];
}
export interface DuckDBConnection {
  query: (sql: string) => Promise<DuckDBQueryResult>;
  close: () => Promise<void>;
}
export interface DuckDBHandle {
  conn: DuckDBConnection;
  headers: string[];
  rowCount: number;
  terminate: () => Promise<void>;
}

async function instantiate() {
  const duckdb = await import("@duckdb/duckdb-wasm");
  const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
  const workerBlob = new Blob([`importScripts("${bundle.mainWorker}");`], {
    type: "application/javascript",
  });
  const worker = new Worker(URL.createObjectURL(workerBlob));
  const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  const conn = await db.connect();
  return { db, conn, worker };
}

export async function loadDuckDBFromCells(cells: Cell[]): Promise<DuckDBHandle> {
  const { db, conn, worker } = await instantiate();
  const { headers, rows } = buildRecords(cells);
  if (rows.length === 0) {
    await conn.query(`CREATE TABLE sheet (col TEXT);`);
  } else {
    await db.registerFileText("sheet.json", JSON.stringify(rows));
    await conn.query(`CREATE TABLE sheet AS SELECT * FROM read_json_auto('sheet.json');`);
  }
  return {
    conn: conn as unknown as DuckDBConnection,
    headers,
    rowCount: rows.length,
    terminate: async () => {
      try {
        await conn.close();
        await db.terminate();
        worker.terminate();
      } catch {
        /* ignore */
      }
    },
  };
}

export async function loadDuckDBFromSheet(sheetId: string): Promise<DuckDBHandle> {
  const { cells } = await api.getSheet(sheetId);
  return loadDuckDBFromCells(cells);
}
