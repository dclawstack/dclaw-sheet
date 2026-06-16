import { describe, it, expect } from "vitest";
import { buildRecords, buildSchema, recordsToCells } from "@/lib/sheet-data";
import type { Cell } from "@/lib/types";

function cell(row: number, col: number, value: string, dtype = "string"): Cell {
  return { id: `${row}:${col}`, sheetId: "s", row, col, raw: value, value, dtype };
}

describe("buildRecords", () => {
  it("uses the first row as headers and coerces by dtype", () => {
    const cells = [
      cell(0, 0, "month"),
      cell(0, 1, "mrr"),
      cell(1, 0, "2026-01-01", "date"),
      cell(1, 1, "100", "number"),
    ];
    const { headers, rows } = buildRecords(cells);
    expect(headers).toEqual(["month", "mrr"]);
    expect(rows[0]).toEqual({ month: "2026-01-01", mrr: 100 });
  });

  it("sanitizes + uniquifies header names", () => {
    const { headers } = buildRecords([cell(0, 0, "a b"), cell(0, 1, "a b"), cell(1, 0, "x")]);
    expect(headers[0]).toBe("a_b");
    expect(headers[1]).toBe("a_b_1");
  });
});

describe("buildSchema", () => {
  it("infers column types", () => {
    const cells = [
      cell(0, 0, "month"),
      cell(0, 1, "mrr"),
      cell(1, 0, "2026-01-01", "date"),
      cell(2, 0, "2026-02-01", "date"),
      cell(1, 1, "100", "number"),
      cell(2, 1, "200", "number"),
    ];
    const schema = buildSchema(cells);
    expect(schema.columns.find((c) => c.name === "month")?.dtype).toBe("temporal");
    expect(schema.columns.find((c) => c.name === "mrr")?.dtype).toBe("number");
    expect(schema.rowCount).toBe(2);
  });
});

describe("recordsToCells", () => {
  it("emits a header row plus typed data rows", () => {
    const out = recordsToCells(["a", "b"], [{ a: 1, b: "x" }]);
    expect(out.find((c) => c.row === 0 && c.col === 0)?.raw).toBe("a");
    expect(out.find((c) => c.row === 1 && c.col === 0)?.dtype).toBe("number");
  });
});
