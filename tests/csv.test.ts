import { describe, it, expect } from "vitest";
import { parseCsv, inferDtype } from "@/lib/csv";

describe("parseCsv", () => {
  it("handles quoted fields containing commas", () => {
    const rows = parseCsv('name,amount\n"Acme, Inc",100\nBeta,200\n');
    expect(rows).toEqual([
      ["name", "amount"],
      ["Acme, Inc", "100"],
      ["Beta", "200"],
    ]);
  });

  it("handles escaped quotes and CRLF", () => {
    const rows = parseCsv('a,b\r\n"say ""hi""",2\r\n');
    expect(rows[1][0]).toBe('say "hi"');
  });

  it("drops fully blank rows", () => {
    const rows = parseCsv("a,b\n\n1,2\n");
    expect(rows).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("inferDtype", () => {
  it("classifies values", () => {
    expect(inferDtype("100")).toBe("number");
    expect(inferDtype("-3.14")).toBe("number");
    expect(inferDtype("2026-01-01")).toBe("date");
    expect(inferDtype("true")).toBe("bool");
    expect(inferDtype("hello")).toBe("string");
    expect(inferDtype("")).toBe("string");
  });
});
