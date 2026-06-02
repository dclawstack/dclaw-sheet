"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Database, Play, X } from "lucide-react";

import { loadDuckDBFromSheet, type DuckDBHandle } from "@/lib/duckdb";

interface SqlPanelProps {
  sheetId: string;
  onClose?: () => void;
}

interface QueryResult {
  columns: string[];
  rows: (string | number | boolean | null)[][];
  durationMs: number;
}

export function SqlPanel({ sheetId, onClose }: SqlPanelProps) {
  const [query, setQuery] = useState("SELECT * FROM sheet LIMIT 20;");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [ready, setReady] = useState(false);
  const handleRef = useRef<DuckDBHandle | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    (async () => {
      try {
        const handle = await loadDuckDBFromSheet(sheetId);
        handleRef.current = handle;
        if (cancelled) {
          await handle.terminate();
          return;
        }
        setReady(true);
        await runQuery(query, handle);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to initialise DuckDB");
      }
    })();

    return () => {
      cancelled = true;
      const handle = handleRef.current;
      if (handle) handle.terminate().catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetId]);

  async function runQuery(sql: string, handleOverride?: DuckDBHandle) {
    const handle = handleOverride ?? handleRef.current;
    if (!handle) return;
    setBusy(true);
    setError(null);
    const started = performance.now();
    try {
      const r = await handle.conn.query(sql);
      const columns = r.schema.fields.map((f) => f.name);
      const rows = r.toArray().map((row) =>
        columns.map((c) => {
          const v = row[c];
          if (v === undefined || v === null) return null;
          if (typeof v === "bigint") return Number(v);
          if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
            return v;
          }
          return String(v);
        }),
      );
      setResult({
        columns,
        rows,
        durationMs: Math.round(performance.now() - started),
      });
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
          <span className="text-[10px] uppercase tracking-wider text-gray-600">
            DuckDB-WASM
          </span>
        </div>
        {onClose && (
          <button onClick={onClose} aria-label="Close" className="text-gray-600 hover:text-gray-700">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="p-4 space-y-3">
        <textarea
          aria-label="SQL query"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full h-24 rounded-md border border-gray-300 p-3 text-sm font-mono focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] outline-none resize-none"
        />
        <div className="flex items-center justify-between">
          <button
            onClick={() => runQuery(query)}
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
                      {v === null ? <span className="text-gray-600">·</span> : String(v)}
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
