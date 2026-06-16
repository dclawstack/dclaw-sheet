import { describe, it, expect } from "vitest";
import { inferFields, recommendChart } from "@/lib/charts";

const rows = [
  { month: "2026-01-01", mrr: 1000, plan: "pro" },
  { month: "2026-02-01", mrr: 1500, plan: "pro" },
  { month: "2026-03-01", mrr: 2200, plan: "free" },
];

describe("inferFields", () => {
  it("detects temporal / quantitative / nominal", () => {
    const f = inferFields(rows);
    expect(f.find((x) => x.name === "month")?.type).toBe("temporal");
    expect(f.find((x) => x.name === "mrr")?.type).toBe("quantitative");
    expect(f.find((x) => x.name === "plan")?.type).toBe("nominal");
  });
});

describe("recommendChart", () => {
  it("picks a line of mrr over month", () => {
    const spec = recommendChart(rows);
    expect(spec?.mark).toBe("line");
    expect((spec?.encoding as any).x.field).toBe("month");
    expect((spec?.encoding as any).y.field).toBe("mrr");
  });

  it("honors explicit overrides", () => {
    const spec = recommendChart(rows, { x: "plan", y: "mrr", mark: "bar" });
    expect(spec?.mark).toBe("bar");
    expect((spec?.encoding as any).x.field).toBe("plan");
  });

  it("returns null for empty input", () => {
    expect(recommendChart([])).toBeNull();
  });
});
