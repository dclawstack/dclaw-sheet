"use client";

import { useEffect, useRef, useState } from "react";
import { TrendingUp, X, AlertTriangle } from "lucide-react";

import {
  detectAnomalies,
  forecastColumn,
  type AnomalyResponse,
  type ForecastResponse,
} from "@/lib/api";

interface ForecastPanelProps {
  sheetId: string;
  onClose?: () => void;
}

interface ChartRow {
  t: number;
  actual?: number;
  mean?: number;
  lower_80?: number;
  upper_80?: number;
  lower_95?: number;
  upper_95?: number;
}

function buildChartData(forecast: ForecastResponse): ChartRow[] {
  const rows: ChartRow[] = [];
  forecast.history.forEach((v, i) => rows.push({ t: i, actual: v }));
  const lastIdx = forecast.history.length - 1;
  // Stitch the last actual into the forecast line so it doesn't visually disconnect
  if (forecast.history.length > 0) {
    rows.push({ t: lastIdx, mean: forecast.history[lastIdx], lower_80: forecast.history[lastIdx], upper_80: forecast.history[lastIdx], lower_95: forecast.history[lastIdx], upper_95: forecast.history[lastIdx] });
  }
  forecast.forecast.forEach((p, i) =>
    rows.push({
      t: lastIdx + 1 + i,
      mean: p.mean,
      lower_80: p.lower_80,
      upper_80: p.upper_80,
      lower_95: p.lower_95,
      upper_95: p.upper_95,
    }),
  );
  return rows;
}

export function ForecastPanel({ sheetId, onClose }: ForecastPanelProps) {
  const [column, setColumn] = useState("B");
  const [periods, setPeriods] = useState(12);
  const [skipHeader, setSkipHeader] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [anomalies, setAnomalies] = useState<AnomalyResponse | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  async function runForecast() {
    setBusy(true);
    setError(null);
    setAnomalies(null);
    try {
      const f = await forecastColumn(sheetId, column.toUpperCase(), periods, skipHeader);
      setForecast(f);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Forecast failed");
    } finally {
      setBusy(false);
    }
  }

  async function runAnomalies() {
    setBusy(true);
    setError(null);
    try {
      const a = await detectAnomalies(sheetId, column.toUpperCase(), 0.1, skipHeader);
      setAnomalies(a);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Anomaly detection failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!forecast || !containerRef.current) return;
    let cancelled = false;
    (async () => {
      const { default: embed } = await import("vega-embed");
      if (cancelled || !containerRef.current) return;
      await embed(
        containerRef.current,
        {
          $schema: "https://vega.github.io/schema/vega-lite/v5.json",
          data: { values: buildChartData(forecast) },
          width: "container",
          height: 280,
          layer: [
            {
              mark: { type: "area", color: "#10B981", opacity: 0.12 },
              encoding: {
                x: { field: "t", type: "quantitative", title: "Period" },
                y: { field: "lower_95", type: "quantitative", title: forecast.column_name ?? forecast.column },
                y2: { field: "upper_95" },
              },
            },
            {
              mark: { type: "area", color: "#10B981", opacity: 0.22 },
              encoding: {
                x: { field: "t", type: "quantitative" },
                y: { field: "lower_80", type: "quantitative" },
                y2: { field: "upper_80" },
              },
            },
            {
              mark: { type: "line", color: "#0F766E", strokeDash: [4, 3] },
              encoding: {
                x: { field: "t", type: "quantitative" },
                y: { field: "mean", type: "quantitative" },
              },
            },
            {
              mark: { type: "line", color: "#1f2937" },
              encoding: {
                x: { field: "t", type: "quantitative" },
                y: { field: "actual", type: "quantitative" },
              },
            },
          ],
        },
        { actions: false, renderer: "canvas" },
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [forecast]);

  return (
    <div className="rounded-lg bg-white border border-gray-200 shadow-sm flex flex-col">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-[#10B981]" />
          <h3 className="font-semibold text-gray-900">Forecast</h3>
          <span className="text-[10px] uppercase tracking-wider text-gray-600">
            SARIMAX
          </span>
        </div>
        {onClose && (
          <button onClick={onClose} aria-label="Close" className="text-gray-600 hover:text-gray-700">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="p-4 space-y-3">
        <div className="grid grid-cols-4 gap-2 text-sm">
          <label className="flex flex-col">
            <span className="text-xs text-gray-500">Column</span>
            <input
              aria-label="Column"
              value={column}
              onChange={(e) => setColumn(e.target.value.toUpperCase())}
              className="border border-gray-300 rounded px-2 py-1 font-mono"
            />
          </label>
          <label className="flex flex-col col-span-2">
            <span className="text-xs text-gray-500">Periods ahead: {periods}</span>
            <input
              type="range"
              aria-label="Periods ahead"
              min={1}
              max={36}
              value={periods}
              onChange={(e) => setPeriods(Number(e.target.value))}
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-700">
            <input
              type="checkbox"
              aria-label="Skip header"
              checked={skipHeader}
              onChange={(e) => setSkipHeader(e.target.checked)}
            />
            Skip header
          </label>
        </div>
        <div className="flex gap-2">
          <button
            onClick={runForecast}
            disabled={busy}
            className="rounded-md bg-[#10B981] px-3 py-1.5 text-sm text-white font-medium hover:bg-[#0E9F6E] disabled:opacity-50"
          >
            {busy ? "Forecasting…" : "Forecast"}
          </button>
          <button
            onClick={runAnomalies}
            disabled={busy}
            className="rounded-md bg-white border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Detect anomalies
          </button>
        </div>
        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 p-2 text-sm text-red-800">
            {error}
          </div>
        )}
        {forecast && (
          <div className="text-xs text-gray-500">
            order ({forecast.order.join(", ")}) · AIC {forecast.fit_aic.toFixed(1)}
            {forecast.column_name && (
              <> · column: <span className="font-mono">{forecast.column_name}</span></>
            )}
          </div>
        )}
      </div>

      {forecast && (
        <div className="px-4 pb-4">
          <div ref={containerRef} className="w-full" />
        </div>
      )}

      {anomalies && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3">
          <div className="text-sm font-medium mb-2">
            {anomalies.outlier_count} anomalies flagged
            {anomalies.column_name && (
              <> in <span className="font-mono">{anomalies.column_name}</span></>
            )}
          </div>
          {anomalies.outlier_count > 0 ? (
            <div className="max-h-48 overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1">Row</th>
                    <th className="text-right px-2 py-1">Value</th>
                    <th className="text-right px-2 py-1">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {anomalies.points
                    .filter((p) => p.is_outlier)
                    .sort((a, b) => a.score - b.score)
                    .map((p) => (
                      <tr key={p.row} className="border-t border-gray-100">
                        <td className="px-2 py-1 font-mono">{p.row + 1}</td>
                        <td className="px-2 py-1 text-right">{p.value}</td>
                        <td className="px-2 py-1 text-right text-amber-700">
                          {p.score.toFixed(3)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-xs text-gray-500">No outliers detected.</div>
          )}
        </div>
      )}
    </div>
  );
}
