import { describe, it, expect } from "vitest";
import { buildXlsx, parseXlsx, safeFilename } from "@/lib/xlsx";

describe("xlsx round-trip", () => {
  it("preserves values, numbers and formulas", async () => {
    const cells = [
      { row: 0, col: 0, raw: "name", value: "name", dtype: "string" },
      { row: 0, col: 1, raw: "amount", value: "amount", dtype: "string" },
      { row: 1, col: 0, raw: "Acme", value: "Acme", dtype: "string" },
      { row: 1, col: 1, raw: "100", value: "100", dtype: "number" },
      { row: 2, col: 1, raw: "=B2*2", value: "200", dtype: "number" },
    ];
    const buf = await buildXlsx("Demo", cells);
    const { name, cells: parsed } = await parseXlsx(buf);
    expect(name).toBe("Demo");

    const at = (r: number, c: number) => parsed.find((p) => p.row === r && p.col === c);
    expect(at(1, 0)?.value).toBe("Acme");
    expect(at(1, 1)?.dtype).toBe("number");
    expect(at(2, 1)?.raw).toBe("=B2*2");
  });
});

describe("safeFilename", () => {
  it("strips unsafe characters and header-injection attempts", () => {
    expect(safeFilename('a"; rm -rf /')).toMatch(/^[A-Za-z0-9._-]+\.xlsx$/);
    expect(safeFilename("My Sheet")).toBe("My_Sheet.xlsx");
    expect(safeFilename("")).toBe("sheet.xlsx");
  });
});
