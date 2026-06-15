"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Table2, X } from "lucide-react";

import { loadDuckDBFromSheet, quoteIdent, type DuckDBHandle } from "@/lib/duckdb";

type AggFn = "SUM" | "AVG" | "COUNT" | "MIN" | "MAX";

interface Measure {
  field: string;
  fn: AggFn;
}

interface PivotPanelProps {
  sheetId: string;
  onClose?: () => void;
}

interface PivotResult {
  rowDims: string[];
  colDim: string | null;
  measureLabels: string[];   // e.g. ["SUM(revenue)", "AVG(cost)"]
  colValues: string[];       // unique col-dim values when crosstab is on; else []
  rows: (string | number | boolean | null)[][];
}

const AGG_FNS: AggFn[] = ["SUM", "AVG", "COUNT", "MIN", "MAX"];

function aliasFor(measure: Measure): string {
  return `${measure.fn}_${measure.field}`;
}

function buildSql(
  rowDims: string[],
  colDim: string | null,
  measures: Measure[],
): string {
  if (measures.length === 0) {
    throw new Error("Pick at least one value (measure)");
  }
  const dims = [...rowDims];
  if (colDim) dims.push(colDim);
  const selectCols = dims.map(quoteIdent).join(", ");
  const measureCols = measures
    .map((m) => `${m.fn}(${quoteIdent(m.field)}) AS ${quoteIdent(aliasFor(m))}`)
    .join(", ");
  const groupBy = dims.map((_, i) => String(i + 1)).join(", ");
  return [
    "SELECT",
    [selectCols, measureCols].filter(Boolean).join(", "),
    "FROM sheet",
    dims.length > 0 ? `GROUP BY ${groupBy}` : "",
    dims.length > 0 ? `ORDER BY ${groupBy}` : "",
    "LIMIT 5000",
  ]
    .filter(Boolean)
    .join(" ");
}

function pivotCrossTab(
  rowDims: string[],
  colDim: string,
  measure: Measure,
  raw: Record<string, unknown>[],
): { rowKeys: string[][]; colValues: string[]; matrix: (number | null)[][] } {
  const rowKeySet = new Map<string, string[]>();
  const colSet = new Set<string>();
  for (const row of raw) {
    const key = rowDims.map((d) => String(row[d] ?? "")).join("");
    if (!rowKeySet.has(key)) {
      rowKeySet.set(key, rowDims.map((d) => String(row[d] ?? "")));
    }
    colSet.add(String(row[colDim] ?? ""));
  }
  const rowKeys = Array.from(rowKeySet.values()).sort((a, b) =>
    a.join("").localeCompare(b.join("")),
  );
  const colValues = Array.from(colSet).sort();
  const rowKeyToIndex = new Map<string, number>();
  rowKeys.forEach((k, idx) => rowKeyToIndex.set(k.join(""), idx));
  const colToIndex = new Map<string, number>();
  colValues.forEach((c, idx) => colToIndex.set(c, idx));

  const matrix: (number | null)[][] = rowKeys.map(() =>
    colValues.map(() => null),
  );
  const alias = aliasFor(measure);
  for (const row of raw) {
    const rKey = rowDims.map((d) => String(row[d] ?? "")).join("");
    const cKey = String(row[colDim] ?? "");
    const ri = rowKeyToIndex.get(rKey);
    const ci = colToIndex.get(cKey);
    const v = row[alias];
    if (ri !== undefined && ci !== undefined) {
      matrix[ri][ci] =
        typeof v === "bigint"
          ? Number(v)
          : typeof v === "number"
            ? v
            : v === null || v === undefined
              ? null
              : Number(v);
    }
  }
  return { rowKeys, colValues, matrix };
}

export function PivotPanel({ sheetId, onClose }: PivotPanelProps) {
  const handleRef = useRef<DuckDBHandle | null>(null);
  const [ready, setReady] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[]>([]);
  const [colDim, setColDim] = useState<string | null>(null);
  const [measures, setMeasures] = useState<Measure[]>([]);
  const [result, setResult] = useState<PivotResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
        setHeaders(handle.headers);
        setReady(true);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to initialise DuckDB");
      }
    })();
    return () => {
      cancelled = true;
      const handle = handleRef.current;
      if (handle) handle.terminate().catch(() => undefined);
    };
  }, [sheetId]);

  const available = useMemo(
    () =>
      headers.filter(
        (h) => !rows.includes(h) && h !== colDim && !measures.some((m) => m.field === h),
      ),
    [headers, rows, colDim, measures],
  );

  async function run() {
    const handle = handleRef.current;
    if (!handle) return;
    setError(null);
    setBusy(true);
    try {
      if (colDim && measures.length !== 1) {
        throw new Error(
          "Cross-tab supports exactly one measure (multi-measure cross-tab is coming in v1.2)",
        );
      }
      const sql = buildSql(rows, colDim, measures);
      const r = await handle.conn.query(sql);
      const raw = r.toArray();
      const measureLabels = measures.map(
        (m) => `${m.fn}(${m.field})`,
      );

      if (colDim && measures.length === 1) {
        const pivoted = pivotCrossTab(rows, colDim, measures[0], raw);
        setResult({
          rowDims: rows,
          colDim,
          measureLabels,
          colValues: pivoted.colValues,
          rows: pivoted.rowKeys.map((keys, ri) => [
            ...keys,
            ...pivoted.matrix[ri],
          ]),
        });
      } else {
        const cols = [...rows];
        const tableRows: (string | number | boolean | null)[][] = raw.map((row) => [
          ...cols.map((c) => {
            const v = row[c];
            if (v === null || v === undefined) return null;
            if (typeof v === "bigint") return Number(v);
            if (
              typeof v === "string" ||
              typeof v === "number" ||
              typeof v === "boolean"
            )
              return v;
            return String(v);
          }),
          ...measures.map((m) => {
            const v = row[aliasFor(m)];
            if (v === null || v === undefined) return null;
            if (typeof v === "bigint") return Number(v);
            return typeof v === "number" ? v : Number(v);
          }),
        ]);
        setResult({
          rowDims: rows,
          colDim: null,
          measureLabels,
          colValues: [],
          rows: tableRows,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Query failed");
    } finally {
      setBusy(false);
    }
  }

  function addRow(field: string) {
    setRows((r) => [...r, field]);
  }
  function removeRow(field: string) {
    setRows((r) => r.filter((f) => f !== field));
  }
  function addMeasure(field: string) {
    setMeasures((m) => [...m, { field, fn: "SUM" }]);
  }
  function setMeasureFn(idx: number, fn: AggFn) {
    setMeasures((m) => m.map((mm, i) => (i === idx ? { ...mm, fn } : mm)));
  }
  function removeMeasure(idx: number) {
    setMeasures((m) => m.filter((_, i) => i !== idx));
  }

  return (
    <div className="rounded-lg bg-white border border-gray-200 shadow-sm flex flex-col">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <Table2 className="h-4 w-4 text-[#10B981]" />
          <h3 className="font-semibold text-gray-900">Pivot</h3>
          <span className="text-[10px] uppercase tracking-wider text-gray-600">
            OLAP · DuckDB
          </span>
        </div>
        {onClose && (
          <button onClick={onClose} aria-label="Close" className="text-gray-600 hover:text-gray-700">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="p-4 space-y-3">
        {!ready && !error && (
          <div className="text-sm text-gray-500">Initialising DuckDB…</div>
        )}
        {ready && (
          <>
            <div className="text-xs uppercase tracking-wider text-gray-500">
              Available fields
            </div>
            <div className="flex flex-wrap gap-1.5">
              {available.length === 0 ? (
                <span className="text-xs text-gray-600">all assigned</span>
              ) : (
                available.map((h) => (
                  <div key={h} className="flex items-center gap-1">
                    <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-mono">
                      {h}
                    </span>
                    <button
                      onClick={() => addRow(h)}
                      className="text-[10px] text-[#10B981] hover:underline"
                      title="Add to rows"
                    >
                      → row
                    </button>
                    <button
                      onClick={() => addMeasure(h)}
                      className="text-[10px] text-[#10B981] hover:underline"
                      title="Add as measure"
                    >
                      → measure
                    </button>
                    <button
                      onClick={() => setColDim(h)}
                      className="text-[10px] text-[#10B981] hover:underline"
                      title="Use as cross-tab column"
                    >
                      → column
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-md border border-gray-200 p-2 min-h-[80px]">
                <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
                  Rows
                </div>
                {rows.length === 0 ? (
                  <div className="text-xs text-gray-600 italic">drop fields</div>
                ) : (
                  rows.map((r) => (
                    <div key={r} className="flex items-center justify-between text-xs py-0.5">
                      <span className="font-mono">{r}</span>
                      <button
                        onClick={() => removeRow(r)}
                        aria-label="Remove row field"
                        className="text-gray-600 hover:text-red-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>
              <div className="rounded-md border border-gray-200 p-2 min-h-[80px]">
                <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
                  Columns (cross-tab)
                </div>
                {!colDim ? (
                  <div className="text-xs text-gray-600 italic">optional</div>
                ) : (
                  <div className="flex items-center justify-between text-xs py-0.5">
                    <span className="font-mono">{colDim}</span>
                    <button
                      onClick={() => setColDim(null)}
                      aria-label="Remove column field"
                      className="text-gray-600 hover:text-red-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
              <div className="rounded-md border border-gray-200 p-2 min-h-[80px]">
                <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
                  Values
                </div>
                {measures.length === 0 ? (
                  <div className="text-xs text-gray-600 italic">add measures</div>
                ) : (
                  measures.map((m, i) => (
                    <div key={`${m.field}-${i}`} className="flex items-center gap-1 text-xs py-0.5">
                      <select
                        value={m.fn}
                        onChange={(e) => setMeasureFn(i, e.target.value as AggFn)}
                        aria-label="Aggregate function"
                        className="border border-gray-300 rounded px-1 text-xs"
                      >
                        {AGG_FNS.map((fn) => (
                          <option key={fn} value={fn}>
                            {fn}
                          </option>
                        ))}
                      </select>
                      <span className="font-mono flex-1 truncate">{m.field}</span>
                      <button
                        onClick={() => removeMeasure(i)}
                        aria-label="Remove measure"
                        className="text-gray-600 hover:text-red-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <button
              onClick={run}
              disabled={busy || (rows.length === 0 && measures.length === 0)}
              className="rounded-md bg-[#10B981] px-4 py-2 text-sm text-white font-medium hover:bg-[#0E9F6E] disabled:opacity-50 flex items-center gap-1"
            >
              <Plus className="h-3.5 w-3.5" />
              {busy ? "Pivoting…" : "Build pivot"}
            </button>

            {error && (
              <div className="rounded-md bg-red-50 border border-red-200 p-2 text-sm text-red-800">
                {error}
              </div>
            )}
          </>
        )}
      </div>

      {result && (
        <div className="border-t border-gray-100 overflow-auto max-h-[420px]">
          <table className="text-sm w-full border-collapse">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                {result.rowDims.map((d) => (
                  <th
                    key={d}
                    className="px-3 py-2 text-left font-medium text-gray-600 border-b border-gray-200"
                  >
                    {d}
                  </th>
                ))}
                {result.colDim ? (
                  result.colValues.map((cv) => (
                    <th
                      key={cv}
                      className="px-3 py-2 text-right font-medium text-gray-600 border-b border-gray-200"
                    >
                      {cv}
                    </th>
                  ))
                ) : (
                  result.measureLabels.map((m) => (
                    <th
                      key={m}
                      className="px-3 py-2 text-right font-medium text-gray-600 border-b border-gray-200"
                    >
                      {m}
                    </th>
                  ))
                )}
              </tr>
              {result.colDim && (
                <tr>
                  <th
                    colSpan={result.rowDims.length}
                    className="px-3 py-1 text-right text-[10px] text-gray-600 uppercase tracking-wider border-b border-gray-200"
                  >
                    {result.measureLabels[0]}
                  </th>
                  {result.colValues.map((cv) => (
                    <th key={cv} className="border-b border-gray-200" />
                  ))}
                </tr>
              )}
            </thead>
            <tbody>
              {result.rows.map((row, idx) => (
                <tr key={idx} className="even:bg-gray-50">
                  {row.map((v, c) => {
                    const isDim = c < result.rowDims.length;
                    return (
                      <td
                        key={c}
                        className={`px-3 py-1.5 border-b border-gray-100 truncate ${
                          isDim ? "" : "text-right font-mono"
                        }`}
                      >
                        {v === null ? (
                          <span className="text-gray-600">·</span>
                        ) : typeof v === "number" ? (
                          Number.isInteger(v) ? v : v.toFixed(2)
                        ) : (
                          String(v)
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
