import { describe, it, expect } from "vitest";
import { syntheticStripe, detectDrift } from "@/lib/connectors";

describe("syntheticStripe", () => {
  it("is deterministic and well-shaped", () => {
    const a = syntheticStripe("x");
    const b = syntheticStripe("x");
    expect(a.headers).toEqual(["month", "customer", "plan", "region", "mrr", "churned"]);
    expect(a.rows.length).toBe(b.rows.length);
    expect(a.rows[0]).toEqual(b.rows[0]); // seeded → reproducible
    const mrr = a.schema.find((c) => c.name === "mrr");
    expect(mrr?.dtype).toBe("number");
  });
});

describe("detectDrift", () => {
  it("returns no change against null prior", () => {
    const { changed } = detectDrift(null, [{ name: "a", dtype: "string" }]);
    expect(changed).toBe(false);
  });

  it("detects added, removed and retyped columns", () => {
    const prev = [{ name: "a", dtype: "string" }, { name: "b", dtype: "number" }];
    const next = [{ name: "a", dtype: "number" }, { name: "c", dtype: "string" }];
    const d = detectDrift(prev, next);
    expect(d.added).toEqual(["c"]);
    expect(d.removed).toEqual(["b"]);
    expect(d.retyped).toEqual([{ name: "a", from: "string", to: "number" }]);
    expect(d.changed).toBe(true);
  });
});
