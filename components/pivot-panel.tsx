"use client";

import { useEffect, useRef, useState } from "react";
import { loadDuckDBFromSheet, type DuckDBHandle } from "@/lib/duckdb";
import { Button } from "@/components/ui/button";

type Agg = "SUM" | "AVG" | "COUNT" | "MIN" | "MAX";

export function PivotPanel({ sheetId }: { sheetId: string }) {
  const handleRef = useRef<DuckDBHandle | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rowField, setRowField] = useState("");
  const [colField, setColField] = useState("");
  const [valField, setValField] = useState("");
  const [agg, setAgg] = useState<Agg>("SUM");
  const [matrix, setMatrix] = useState<{ cols: string[]; rows: (string | number | null)[][] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        handleRef.current = await loadDuckDBFromSheet(sheetId);
        setHeaders(handleRef.current.headers);
        if (handleRef.current.headers[0]) setRowField(handleRef.current.headers[0]);
        if (handleRef.current.headers[1]) setValField(handleRef.current.headers[1]);
      } catch (e: any) {
        setError(String(e?.message ?? e));
      }
    })();
    return () => {
      handleRef.current?.terminate();
      handleRef.current = null;
    };
  }, [sheetId]);

  async function build() {
    if (!handleRef.current || !rowField || !valField) return;
    setBusy(true);
    setError(null);
    try {
      const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
      const measure = agg === "COUNT" ? `COUNT(${q(valField)})` : `${agg}(${q(valField)})`;
      if (!colField) {
        const sql = `SELECT ${q(rowField)} AS r, ${measure} AS m FROM sheet GROUP BY 1 ORDER BY 1`;
        const res = await handleRef.current.conn.query(sql);
        const data = res.toArray();
        setMatrix({
          cols: [rowField, `${agg}(${valField})`],
          rows: data.map((d) => [d.r as any, d.m as any]),
        });
      } else {
        const sql = `SELECT ${q(rowField)} AS r, ${q(colField)} AS c, ${measure} AS m FROM sheet GROUP BY 1, 2`;
        const res = await handleRef.current.conn.query(sql);
        const data = res.toArray();
        const colVals = Array.from(new Set(data.map((d) => String(d.c)))).sort();
        const rowVals = Array.from(new Set(data.map((d) => String(d.r)))).sort();
        const lookup = new Map<string, unknown>();
        for (const d of data) lookup.set(`${d.r}||${d.c}`, d.m);
        setMatrix({
          cols: [rowField, ...colVals],
          rows: rowVals.map((rv) => [rv, ...colVals.map((cv) => (lookup.get(`${rv}||${cv}`) as any) ?? null)]),
        });
      }
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  const Field = ({ label, value, onChange, allowNone }: { label: string; value: string; onChange: (v: string) => void; allowNone?: boolean }) => (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded border px-2 py-1 text-sm">
        {allowNone && <option value="">(none)</option>}
        {headers.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Rows" value={rowField} onChange={setRowField} />
        <Field label="Columns (cross-tab)" value={colField} onChange={setColField} allowNone />
        <Field label="Values" value={valField} onChange={setValField} />
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Aggregate</span>
          <select value={agg} onChange={(e) => setAgg(e.target.value as Agg)} className="rounded border px-2 py-1 text-sm">
            {(["SUM", "AVG", "COUNT", "MIN", "MAX"] as Agg[]).map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
        <Button size="sm" onClick={build} disabled={busy} className="bg-brand text-brand-foreground hover:bg-brand/90">
          {busy ? "Building…" : "Build pivot"}
        </Button>
      </div>

      {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">{error}</div>}

      {matrix && (
        <div className="flex-1 overflow-auto rounded-md border">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-muted/60">
              <tr>
                {matrix.cols.map((c, i) => (
                  <th key={i} className="border px-2 py-1 text-left font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((v, j) => (
                    <td key={j} className={`border px-2 py-1 ${j > 0 ? "text-right tabular-nums" : ""}`}>
                      {v === null || v === undefined ? "" : String(v)}
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
