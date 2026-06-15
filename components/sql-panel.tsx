"use client";

import { useEffect, useRef, useState } from "react";
import { loadDuckDBFromSheet, type DuckDBHandle } from "@/lib/duckdb";
import { recommendChart, type ChartSpec } from "@/lib/charts";
import { ChartView } from "@/components/chart-view";
import { Button } from "@/components/ui/button";

export function SqlPanel({ sheetId }: { sheetId: string }) {
  const handleRef = useRef<DuckDBHandle | null>(null);
  const [sql, setSql] = useState("SELECT * FROM sheet LIMIT 50;");
  const [cols, setCols] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [chart, setChart] = useState<ChartSpec | null>(null);

  useEffect(() => {
    return () => {
      handleRef.current?.terminate();
      handleRef.current = null;
    };
  }, []);

  async function run() {
    setBusy(true);
    setError(null);
    setChart(null);
    try {
      // reload each run so SQL sees the latest persisted cells
      await handleRef.current?.terminate();
      handleRef.current = await loadDuckDBFromSheet(sheetId);
      const res = await handleRef.current.conn.query(sql);
      const data = res.toArray().map((r) => ({ ...r }));
      setCols(res.schema.fields.map((f) => f.name));
      setRows(data.slice(0, 500));
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setRows([]);
      setCols([]);
    } finally {
      setBusy(false);
    }
  }

  function visualize() {
    const spec = recommendChart(rows);
    setChart(spec);
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <textarea
        value={sql}
        onChange={(e) => setSql(e.target.value)}
        spellCheck={false}
        className="h-28 w-full resize-none rounded-md border bg-muted/20 p-3 font-mono text-sm outline-none focus:ring-1 focus:ring-brand"
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={run} disabled={busy} className="bg-brand text-brand-foreground hover:bg-brand/90">
          {busy ? "Running…" : "Run (table: sheet)"}
        </Button>
        {rows.length > 0 && (
          <Button size="sm" variant="outline" onClick={visualize}>
            Visualize
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 font-mono text-xs text-destructive">
          {error}
        </div>
      )}

      {chart && (
        <div className="rounded-md border p-3">
          <ChartView spec={chart} />
        </div>
      )}

      {rows.length > 0 && (
        <div className="flex-1 overflow-auto rounded-md border">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-muted/60">
              <tr>
                {cols.map((c) => (
                  <th key={c} className="border px-2 py-1 text-left font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {cols.map((c) => (
                    <td key={c} className="border px-2 py-1">
                      {r[c] === null || r[c] === undefined ? "" : String(r[c])}
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
