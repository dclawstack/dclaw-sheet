"use client";

import { useEffect, useRef } from "react";
import type { ChartSpec } from "@/lib/charts";

export function ChartView({ spec }: { spec: ChartSpec }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let view: { finalize: () => void } | undefined;
    let cancelled = false;
    (async () => {
      const embed = (await import("vega-embed")).default;
      if (ref.current && !cancelled) {
        const result = await embed(ref.current, spec as any, { actions: false, renderer: "svg" });
        view = result.view as any;
      }
    })();
    return () => {
      cancelled = true;
      try {
        view?.finalize();
      } catch {
        /* ignore */
      }
    };
  }, [spec]);

  return <div ref={ref} className="w-full" />;
}
