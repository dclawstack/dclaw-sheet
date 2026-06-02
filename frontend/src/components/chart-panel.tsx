"use client";

import { useEffect, useRef, useState } from "react";
import { BarChart3, X } from "lucide-react";

import { recommendChart } from "@/lib/api";

interface ChartPanelProps {
  sheetId: string;
  defaultRange?: { start: string; end: string };
  onClose?: () => void;
}

export function ChartPanel({ sheetId, defaultRange, onClose }: ChartPanelProps) {
  const [start, setStart] = useState(defaultRange?.start ?? "A1");
  const [end, setEnd] = useState(defaultRange?.end ?? "B10");
  const [hasHeader, setHasHeader] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  async function render() {
    setLoading(true);
    setError(null);
    try {
      const { vega_lite } = await recommendChart(sheetId, start, end, hasHeader);
      const { default: embed } = await import("vega-embed");
      if (containerRef.current) {
        await embed(containerRef.current, vega_lite as object, { actions: false, renderer: "canvas" });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chart render failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetId]);

  return (
    <div className="rounded-lg bg-white border border-gray-200 shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-[#10B981]" />
          <h3 className="font-semibold text-gray-900">Auto chart</h3>
        </div>
        {onClose && (
          <button onClick={onClose} aria-label="Close" className="text-gray-600 hover:text-gray-700">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3 text-sm">
        <label className="flex flex-col">
          <span className="text-xs text-gray-500">Start</span>
          <input
            aria-label="Start cell"
            value={start}
            onChange={(e) => setStart(e.target.value.toUpperCase())}
            className="border border-gray-300 rounded px-2 py-1"
          />
        </label>
        <label className="flex flex-col">
          <span className="text-xs text-gray-500">End</span>
          <input
            aria-label="End cell"
            value={end}
            onChange={(e) => setEnd(e.target.value.toUpperCase())}
            className="border border-gray-300 rounded px-2 py-1"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-gray-700">
          <input
            type="checkbox"
            aria-label="First row is header"
            checked={hasHeader}
            onChange={(e) => setHasHeader(e.target.checked)}
          />
          First row is header
        </label>
      </div>
      <button
        onClick={render}
        disabled={loading}
        className="mb-3 rounded-md bg-[#10B981] px-3 py-1.5 text-sm text-white font-medium hover:bg-[#0E9F6E] disabled:opacity-50"
      >
        {loading ? "Rendering…" : "Refresh chart"}
      </button>
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-2 text-sm text-red-800 mb-2">
          {error}
        </div>
      )}
      <div ref={containerRef} className="w-full min-h-[300px]" />
    </div>
  );
}
