"use client";

import { useEffect, useRef, useState } from "react";
import { loadDuckDBFromSheet, type DuckDBHandle } from "@/lib/duckdb";
import { forecast, anomalies, type ForecastResult, type Anomaly } from "@/lib/forecast";
import { ChartView } from "@/components/chart-view";
import type { ChartSpec } from "@/lib/charts";
import { Button } from "@/components/ui/button";

export function ForecastPanel({ sheetId }: { sheetId: string }) {
  const handleRef = useRef<DuckDBHandle | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState("");
  const [valueCol, setValueCol] = useState("");
  const [periods, setPeriods] = useState(6);
  const [season, setSeason] = useState(0);
  const [spec, setSpec] = useState<ChartSpec | null>(null);
  const [outliers, setOutliers] = useState<Anomaly[]>([]);
  const [method, setMethod] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        handleRef.current = await loadDuckDBFromSheet(sheetId);
        const h = handleRef.current.headers;
        setHeaders(h);
        if (h[0]) setGroupBy(h[0]);
        if (h[1]) setValueCol(h[1]);
      } catch (e: any) {
        setError(String(e?.message ?? e));
      }
    })();
    return () => {
      handleRef.current?.terminate();
      handleRef.current = null;
    };
  }, [sheetId]);

  async function run() {
    if (!handleRef.current || !valueCol) return;
    setBusy(true);
    setError(null);
    try {
      const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
      let series: number[];
      let labels: string[];
      if (groupBy && groupBy !== valueCol) {
        const sql = `SELECT ${q(groupBy)} AS g, SUM(${q(valueCol)}) AS v FROM sheet GROUP BY 1 ORDER BY 1`;
        const data = (await handleRef.current.conn.query(sql)).toArray();
        labels = data.map((d) => String(d.g));
        series = data.map((d) => Number(d.v));
      } else {
        const sql = `SELECT ${q(valueCol)} AS v FROM sheet`;
        const data = (await handleRef.current.conn.query(sql)).toArray();
        series = data.map((d) => Number(d.v)).filter((v) => Number.isFinite(v));
        labels = series.map((_, i) => String(i + 1));
      }
      if (series.length < 3) throw new Error("Need at least 3 points to forecast");

      const fc = forecast(series, periods, season);
      setMethod(fc.method);
      setOutliers(anomalies(series));
      setSpec(buildForecastSpec(fc, labels));
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
        {allowNone && <option value="">(row order)</option>}
        {headers.map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Group by (x)" value={groupBy} onChange={setGroupBy} allowNone />
        <Field label="Value (sum)" value={valueCol} onChange={setValueCol} />
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Periods</span>
          <input type="number" min={1} max={36} value={periods} onChange={(e) => setPeriods(+e.target.value)} className="w-16 rounded border px-2 py-1 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Season</span>
          <input type="number" min={0} max={24} value={season} onChange={(e) => setSeason(+e.target.value)} className="w-16 rounded border px-2 py-1 text-sm" />
        </label>
        <Button size="sm" onClick={run} disabled={busy} className="bg-brand text-brand-foreground hover:bg-brand/90">
          {busy ? "Forecasting…" : "Forecast"}
        </Button>
      </div>

      {method && <div className="text-xs text-muted-foreground">method: {method}</div>}
      {error && <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">{error}</div>}

      {spec && (
        <div className="rounded-md border p-3">
          <ChartView spec={spec} />
        </div>
      )}

      {outliers.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-medium">Anomalies ({outliers.length})</div>
          <div className="overflow-auto rounded-md border">
            <table className="w-full border-collapse text-xs">
              <thead className="bg-muted/60">
                <tr>
                  <th className="border px-2 py-1 text-left">#</th>
                  <th className="border px-2 py-1 text-right">value</th>
                  <th className="border px-2 py-1 text-right">expected</th>
                  <th className="border px-2 py-1 text-right">z</th>
                </tr>
              </thead>
              <tbody>
                {outliers.map((a) => (
                  <tr key={a.i}>
                    <td className="border px-2 py-1">{a.i + 1}</td>
                    <td className="border px-2 py-1 text-right tabular-nums">{a.value.toFixed(1)}</td>
                    <td className="border px-2 py-1 text-right tabular-nums">{a.expected.toFixed(1)}</td>
                    <td className="border px-2 py-1 text-right tabular-nums">{a.z.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function buildForecastSpec(fc: ForecastResult, labels: string[]): ChartSpec {
  const hist = fc.history.map((p) => ({ x: labels[p.i] ?? String(p.i + 1), y: p.y, kind: "history" }));
  const fore = fc.forecast.map((p) => ({
    x: `+${p.i - fc.history.length + 1}`,
    y: p.yhat,
    lo80: p.lo80,
    hi80: p.hi80,
    lo95: p.lo95,
    hi95: p.hi95,
    kind: "forecast",
  }));
  const values = [...hist, ...fore];
  return {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    data: { values },
    width: "container",
    height: 320,
    // @ts-expect-error layered spec is valid Vega-Lite; ChartSpec is a simplified shape
    layer: [
      { mark: { type: "area", opacity: 0.15, color: "#10B981" }, encoding: { x: { field: "x", type: "nominal" }, y: { field: "lo95", type: "quantitative", title: "" }, y2: { field: "hi95" } } },
      { mark: { type: "area", opacity: 0.25, color: "#10B981" }, encoding: { x: { field: "x", type: "nominal" }, y: { field: "lo80", type: "quantitative" }, y2: { field: "hi80" } } },
      { mark: { type: "line", point: true }, encoding: { x: { field: "x", type: "nominal", title: "" }, y: { field: "y", type: "quantitative", title: "value" }, color: { field: "kind", type: "nominal", scale: { domain: ["history", "forecast"], range: ["#1f2937", "#10B981"] }, title: "" } } },
    ],
    mark: "line",
    encoding: {},
  };
}
