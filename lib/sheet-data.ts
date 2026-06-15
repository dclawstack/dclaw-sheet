import type { Cell } from "@/lib/types";

/** Universal (server + client) sheet → records logic. No browser APIs. */

export function coerceCell(c: Cell): string | number | boolean | null {
  if (c.value === null || c.value === "") return null;
  if (c.dtype === "number") {
    const n = Number(c.value);
    return Number.isFinite(n) ? n : c.value;
  }
  if (c.dtype === "bool") return c.value.toUpperCase() === "TRUE";
  return c.value;
}

export function buildRecords(cells: Cell[]): { headers: string[]; rows: Record<string, unknown>[] } {
  if (cells.length === 0) return { headers: [], rows: [] };
  let maxRow = 0;
  let maxCol = 0;
  for (const c of cells) {
    if (c.row > maxRow) maxRow = c.row;
    if (c.col > maxCol) maxCol = c.col;
  }
  const grid: (Cell | undefined)[][] = Array.from({ length: maxRow + 1 }, () => Array(maxCol + 1));
  for (const c of cells) grid[c.row][c.col] = c;

  const headers: string[] = [];
  for (let c = 0; c <= maxCol; c++) {
    const cell = grid[0]?.[c];
    const raw = cell?.value && cell.value.trim() !== "" ? cell.value : `col${c}`;
    let name = raw.replace(/[^A-Za-z0-9_]/g, "_");
    if (!/^[A-Za-z_]/.test(name)) name = `_${name}`;
    let unique = name;
    let i = 1;
    while (headers.includes(unique)) unique = `${name}_${i++}`;
    headers.push(unique);
  }

  const rows: Record<string, unknown>[] = [];
  for (let r = 1; r <= maxRow; r++) {
    const record: Record<string, unknown> = {};
    let any = false;
    for (let c = 0; c <= maxCol; c++) {
      const v = grid[r]?.[c] ? coerceCell(grid[r]![c]!) : null;
      record[headers[c]] = v;
      if (v !== null) any = true;
    }
    if (any) rows.push(record);
  }
  return { headers, rows };
}

/** Convert connector records (headers + rows) into sheet cell inputs (header row + data). */
export function recordsToCells(
  headers: string[],
  rows: Record<string, unknown>[]
): { row: number; col: number; raw: string | null; value: string | null; dtype: string }[] {
  const out: { row: number; col: number; raw: string | null; value: string | null; dtype: string }[] = [];
  headers.forEach((h, col) => out.push({ row: 0, col, raw: h, value: h, dtype: "string" }));
  rows.forEach((rec, i) => {
    headers.forEach((h, col) => {
      const v = rec[h];
      if (v === null || v === undefined || v === "") return;
      const s = typeof v === "boolean" ? (v ? "TRUE" : "FALSE") : String(v);
      const dtype = typeof v === "number" ? "number" : typeof v === "boolean" ? "bool" : DATE_RE.test(s) ? "date" : "string";
      out.push({ row: i + 1, col, raw: s, value: s, dtype });
    });
  });
  return out;
}

export interface ColumnSchema {
  name: string;
  dtype: "number" | "temporal" | "bool" | "string";
  samples: unknown[];
}

export interface SheetSchema {
  table: "sheet";
  rowCount: number;
  columns: ColumnSchema[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/;

/** Build a compact schema (column names, inferred types, sample values) for the AI. */
export function buildSchema(cells: Cell[]): SheetSchema {
  const { headers, rows } = buildRecords(cells);
  const columns: ColumnSchema[] = headers.map((name) => {
    let num = 0;
    let temporal = 0;
    let boolean = 0;
    let seen = 0;
    const samples: unknown[] = [];
    for (const r of rows) {
      const v = r[name];
      if (v === null || v === undefined || v === "") continue;
      seen++;
      if (samples.length < 3) samples.push(v);
      if (typeof v === "number") num++;
      else if (typeof v === "boolean") boolean++;
      else if (typeof v === "string" && DATE_RE.test(v)) temporal++;
    }
    let dtype: ColumnSchema["dtype"] = "string";
    if (seen > 0) {
      if (temporal / seen > 0.6) dtype = "temporal";
      else if (boolean / seen > 0.6) dtype = "bool";
      else if (num / seen > 0.8) dtype = "number";
    }
    return { name, dtype, samples };
  });
  return { table: "sheet", rowCount: rows.length, columns };
}
