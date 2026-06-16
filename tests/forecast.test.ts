import { describe, it, expect } from "vitest";
import { forecast, anomalies } from "@/lib/forecast";

describe("forecast", () => {
  it("continues a linear trend with valid confidence bands", () => {
    const series = [100, 110, 121, 133, 146, 161, 177, 194, 213, 235];
    const r = forecast(series, 4);
    expect(r.forecast).toHaveLength(4);
    // monotonic increasing yhat for an increasing series
    expect(r.forecast[3].yhat).toBeGreaterThan(r.forecast[0].yhat);
    for (const p of r.forecast) {
      expect(p.lo95).toBeLessThan(p.yhat);
      expect(p.hi95).toBeGreaterThan(p.yhat);
      expect(p.lo95).toBeLessThanOrEqual(p.lo80);
      expect(p.hi95).toBeGreaterThanOrEqual(p.hi80);
    }
  });

  it("falls back to flat for tiny series", () => {
    const r = forecast([5, 6], 3);
    expect(r.method).toContain("insufficient");
    expect(r.forecast.every((p) => p.yhat === 6)).toBe(true);
  });
});

describe("anomalies (robust MAD)", () => {
  it("flags a spike that mean/std would mask", () => {
    const out = anomalies([10, 11, 12, 13, 90, 15, 16, 17]);
    expect(out).toHaveLength(1);
    expect(out[0].i).toBe(4);
    expect(out[0].value).toBe(90);
  });

  it("reports nothing on clean data", () => {
    expect(anomalies([10, 11, 12, 13, 14, 15, 16, 17])).toHaveLength(0);
  });
});
