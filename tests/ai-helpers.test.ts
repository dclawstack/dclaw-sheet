import { describe, it, expect } from "vitest";
import { isReadOnly } from "@/lib/ai/sql";
import { parseJsonLoose } from "@/lib/ai/openrouter";

describe("isReadOnly", () => {
  it("accepts SELECT / WITH", () => {
    expect(isReadOnly("SELECT * FROM sheet")).toBe(true);
    expect(isReadOnly("WITH t AS (SELECT 1) SELECT * FROM t")).toBe(true);
  });
  it("rejects mutations", () => {
    expect(isReadOnly("DELETE FROM sheet")).toBe(false);
    expect(isReadOnly("DROP TABLE sheet")).toBe(false);
    expect(isReadOnly("SELECT 1; DROP TABLE sheet")).toBe(false);
    expect(isReadOnly("update sheet set a=1")).toBe(false);
  });
});

describe("parseJsonLoose", () => {
  it("parses fenced and prose-wrapped JSON", () => {
    expect(parseJsonLoose('```json\n{"sql":"SELECT 1"}\n```')).toEqual({ sql: "SELECT 1" });
    expect(parseJsonLoose('Here you go: {"a":1} cheers')).toEqual({ a: 1 });
    expect(parseJsonLoose("not json")).toBeNull();
  });
});
