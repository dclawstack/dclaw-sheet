import { describe, it, expect } from "vitest";
import { colToLetter, letterToCol, a1, classifyValue } from "@/lib/cells";

describe("address helpers", () => {
  it("round-trips columns", () => {
    for (const c of [0, 1, 25, 26, 27, 51, 52, 701, 702]) {
      expect(letterToCol(colToLetter(c))).toBe(c);
    }
    expect(colToLetter(0)).toBe("A");
    expect(colToLetter(26)).toBe("AA");
    expect(a1(4, 2)).toBe("C5");
  });

  it("classifies values", () => {
    expect(classifyValue(42)).toBe("number");
    expect(classifyValue(true)).toBe("bool");
    expect(classifyValue("#DIV/0!")).toBe("error");
    expect(classifyValue("text")).toBe("string");
  });
});
