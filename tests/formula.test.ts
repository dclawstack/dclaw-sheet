import { describe, it, expect } from "vitest";
import { FormulaSheet } from "@/lib/formula";

describe("FormulaSheet", () => {
  it("evaluates SUM and recalculates dependents on edit", () => {
    const fs = new FormulaSheet(10, 5, [
      { row: 0, col: 0, raw: "10" },
      { row: 1, col: 0, raw: "20" },
      { row: 2, col: 0, raw: "=SUM(A1:A2)" },
    ]);
    expect(fs.getDisplay(2, 0)).toBe("30");
    const changed = fs.setCell(0, 0, "100");
    expect(fs.getDisplay(2, 0)).toBe("120");
    // both the edited cell and its dependent are reported
    expect(changed.find((c) => c.row === 2 && c.col === 0)?.value).toBe("120");
    fs.destroy();
  });

  it("flags errors with an error dtype", () => {
    const fs = new FormulaSheet(3, 3, []);
    const [c] = fs.setCell(0, 0, "=1/0");
    expect(c.value).toBe("#DIV/0!");
    expect(c.dtype).toBe("error");
    fs.destroy();
  });

  it("supports text + logical functions", () => {
    const fs = new FormulaSheet(3, 3, [
      { row: 0, col: 0, raw: "=UPPER(\"hi\")" },
      { row: 0, col: 1, raw: "=IF(2>1, \"yes\", \"no\")" },
    ]);
    expect(fs.getDisplay(0, 0)).toBe("HI");
    expect(fs.getDisplay(0, 1)).toBe("yes");
    fs.destroy();
  });

  it("clears a cell when set to empty", () => {
    const fs = new FormulaSheet(3, 3, [{ row: 0, col: 0, raw: "5" }]);
    const changed = fs.setCell(0, 0, "");
    expect(changed[0].raw).toBe(null);
    expect(fs.getDisplay(0, 0)).toBe("");
    fs.destroy();
  });
});
