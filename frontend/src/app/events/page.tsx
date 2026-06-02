"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Activity, BarChart3 } from "lucide-react";

import {
  listEvents,
  telemetrySummary,
  type TelemetryEvent,
  type TelemetrySummary,
} from "@/lib/api";

function VegaBar({ data, x, y, color }: { data: { day: string; count: number }[]; x: string; y: string; color: string }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { default: embed } = await import("vega-embed");
      if (cancelled || !ref.current) return;
      await embed(
        ref.current,
        {
          $schema: "https://vega.github.io/schema/vega-lite/v5.json",
          data: { values: data },
          mark: { type: "bar", color },
          encoding: {
            x: { field: "day", type: "ordinal", title: x },
            y: { field: "count", type: "quantitative", title: y },
            tooltip: [
              { field: "day", type: "ordinal" },
              { field: "count", type: "quantitative" },
            ],
          },
          width: "container",
          height: 200,
        },
        { actions: false, renderer: "canvas" },
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [data, x, y, color]);

  return <div ref={ref} className="w-full" />;
}

export default function EventsPage() {
  const [summary, setSummary] = useState<TelemetrySummary | null>(null);
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [s, e] = await Promise.all([telemetrySummary(7), listEvents(50)]);
      setSummary(s);
      setEvents(e.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load telemetry");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-[#10B981] px-6 py-4 flex items-center gap-3">
        <Link href="/" className="text-white/80 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <Activity className="h-5 w-5 text-white" />
        <h1 className="text-xl font-semibold text-white">Activity</h1>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-gray-500">Loading…</div>
        ) : summary ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-lg bg-white border border-gray-200 shadow-sm p-5">
                <div className="text-xs text-gray-500 uppercase tracking-wider">Total events</div>
                <div className="text-3xl font-bold text-[#10B981] mt-1">{summary.total_events}</div>
              </div>
              <div className="rounded-lg bg-white border border-gray-200 shadow-sm p-5">
                <div className="text-xs text-gray-500 uppercase tracking-wider">Today</div>
                <div className="text-3xl font-bold text-[#10B981] mt-1">{summary.events_today}</div>
              </div>
              <div className="rounded-lg bg-white border border-gray-200 shadow-sm p-5">
                <div className="text-xs text-gray-500 uppercase tracking-wider">Event types (30d)</div>
                <div className="text-3xl font-bold text-[#10B981] mt-1">{summary.by_type.length}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-lg bg-white border border-gray-200 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-3">
                  <BarChart3 className="h-4 w-4 text-[#10B981]" />
                  <h2 className="font-semibold text-gray-900">Events per day (last 7d)</h2>
                </div>
                <VegaBar data={summary.daily_counts} x="Day" y="Events" color="#10B981" />
              </div>
              <div className="rounded-lg bg-white border border-gray-200 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-3">
                  <BarChart3 className="h-4 w-4 text-[#10B981]" />
                  <h3 className="font-semibold text-gray-900">Daily active workbooks (last 7d)</h3>
                </div>
                <VegaBar data={summary.daily_active_workbooks} x="Day" y="Active workbooks" color="#0E9F6E" />
              </div>
            </div>

            <div className="rounded-lg bg-white border border-gray-200 shadow-sm p-5">
              <h3 className="font-semibold text-gray-900 mb-3">Events by type (last 30d)</h3>
              <table className="w-full text-sm">
                <thead className="text-left text-gray-500">
                  <tr>
                    <th className="py-1 font-medium">Type</th>
                    <th className="py-1 font-medium text-right">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.by_type.map((b) => (
                    <tr key={b.event_type} className="border-t border-gray-100">
                      <td className="py-1.5 font-mono text-xs">{b.event_type}</td>
                      <td className="py-1.5 text-right">{b.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-lg bg-white border border-gray-200 shadow-sm">
              <h3 className="font-semibold text-gray-900 p-5 pb-3">Recent events</h3>
              <div className="overflow-auto max-h-[400px]">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium text-gray-600">When</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-600">Type</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-600">Payload</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((e) => (
                      <tr key={e.id} className="border-t border-gray-100">
                        <td className="px-4 py-1.5 text-gray-500 text-xs whitespace-nowrap">
                          {new Date(e.created_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-1.5 font-mono text-xs">{e.event_type}</td>
                        <td className="px-4 py-1.5 font-mono text-[11px] text-gray-700 truncate max-w-md">
                          {e.payload ? JSON.stringify(e.payload) : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}
