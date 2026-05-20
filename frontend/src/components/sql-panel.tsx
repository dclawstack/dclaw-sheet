"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Database, Play, X } from "lucide-react";

import { listCells, type Cell } from "@/lib/api";

interface SqlPanelProps {
  sheetId: string;
  onClose?: () => void;
}

interface QueryResult {
  columns: string[];
  rows: (string | number | boolean | null)[][];
  durationMs: number;
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

function buildRecords(cells: Cell[]): { headers: string[]; rows: Record<string, unknown>[] } {
  if (cells.length === 0) return { headers: [], rows: [] };
  let maxRow = 0;
  let maxCol = 0;
  for (const c of cells) {
    if (c.row > maxRow) maxRow = c.row;
    if (c.column > maxCol) maxCol = c.column;
  }
  const grid: (Cell | undefined)[][] = Array.from({ length: maxRow + 1 }, () => Array(maxCol + 1));
  for (const c of cells) grid[c.row][c.column] = c;

  const headerCells = grid[0];
  const headers: string[] = [];
  for (let c = 0; c <= maxCol; c += 1) {
    const cell = headerCells?.[c];
    const fallback = `col${c}`;
    const raw = cell?.value && cell.value.trim() !== "" ? cell.value : fallback;
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

export function SqlPanel({ sheetId, onClose }: SqlPanelProps) {
  const [query, setQuery] = useState("SELECT * FROM sheet LIMIT 20;");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [ready, setReady] = useState(false);
  const dbRef = useRef<unknown | null>(null);
  const connRef = useRef<unknown | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    async function init() {
      try {
        const duckdb = await import("@duckdb/duckdb-wasm");
        const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
        const workerBlob = new Blob([`importScripts("${bundle.mainWorker}");`], {
          type: "application/javascript",
        });
        const worker = new Worker(URL.createObjectURL(workerBlob));
        const logger = new duckdb.ConsoleLogger();
        const db = new duckdb.AsyncDuckDB(logger, worker);
        await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
        const conn = await db.connect();
        dbRef.current = db;
        connRef.current = conn;

        const cells = await listCells(sheetId);
        const { headers, rows } = buildRecords(cells);
        if (rows.length === 0) {
          await conn.query(`CREATE TABLE sheet (col TEXT);`);
        } else {
          await db.registerFileText("sheet.json", JSON.stringify(rows));
          await conn.query(`CREATE TABLE sheet AS SELECT * FROM read_json_auto('sheet.json');`);
        }
        if (!cancelled) {
          setReady(true);
          // Auto-run the default query so the user sees data immediately
          await runQuery(conn);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to initialise DuckDB");
      }
    }

    init();

    return () => {
      cancelled = true;
      const conn = connRef.current as { close?: () => Promise<void> } | null;
      const db = dbRef.current as { terminate?: () => Promise<void> } | null;
      if (conn?.close) conn.close().catch(() => undefined);
      if (db?.terminate) db.terminate().catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetId]);

  async function runQuery(connOverride?: unknown) {
    const conn = (connOverride ?? connRef.current) as {
      query: (sql: string) => Promise<{
        schema: { fields: { name: string }[] };
        toArray: () => Record<string, unknown>[];
      }>;
    } | null;
    if (!conn) return;
    setBusy(true);
    setError(null);
    const started = performance.now();
    try {
      const r = await conn.query(query);
      const columns = r.schema.fields.map((f) => f.name);
      const rows = r.toArray().map((row) =>
        columns.map((c) => {
          const v = row[c];
          if (v === undefined || v === null) return null;
          if (typeof v === "bigint") return Number(v);
          if (
            typeof v === "string" ||
            typeof v === "number" ||
            typeof v === "boolean"
          )
            return v;
          return String(v);
        }),
      );
      setResult({ columns, rows, durationMs: Math.round(performance.now() - started) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Query failed");
    } finally {
      setBusy(false);
    }
  }

  const placeholder = useMemo(
    () => "SELECT * FROM sheet WHERE revenue > 100 ORDER BY revenue DESC LIMIT 10;",
    [],
  );

  return (
    <div className="rounded-lg bg-white border border-gray-200 shadow-sm flex flex-col">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-[#10B981]" />
          <h3 className="font-semibold text-gray-900">SQL panel</h3>
          <span className="text-[10px] uppercase tracking-wider text-gray-400">
            DuckDB-WASM
          </span>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="p-4 space-y-3">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full h-24 rounded-md border border-gray-300 p-3 text-sm font-mono focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] outline-none resize-none"
        />
        <div className="flex items-center justify-between">
          <button
            onClick={() => runQuery()}
            disabled={busy || !ready}
            className="rounded-md bg-[#10B981] px-4 py-2 text-sm text-white font-medium hover:bg-[#0E9F6E] disabled:opacity-50 flex items-center gap-1"
          >
            <Play className="h-3.5 w-3.5" />
            {ready ? "Run" : "Initialising…"}
          </button>
          {result && (
            <span className="text-xs text-gray-500">
              {result.rows.length} rows · {result.durationMs}ms
            </span>
          )}
        </div>
        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 p-2 text-sm text-red-800">
            {error}
          </div>
        )}
      </div>

      {result && result.columns.length > 0 && (
        <div className="border-t border-gray-100 overflow-auto max-h-[400px]">
          <table className="text-sm w-full">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                {result.columns.map((c) => (
                  <th
                    key={c}
                    className="px-3 py-2 text-left font-medium text-gray-600 border-b border-gray-200"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, idx) => (
                <tr key={idx} className="even:bg-gray-50">
                  {row.map((v, c) => (
                    <td key={c} className="px-3 py-1.5 border-b border-gray-100 truncate">
                      {v === null ? <span className="text-gray-300">·</span> : String(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
