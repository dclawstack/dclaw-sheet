import ExcelJS from "exceljs";

export interface XlsxCell {
  row: number; // 0-indexed
  col: number; // 0-indexed
  raw: string | null;
  value: string | null;
  dtype: string;
}

function fmtPrimitive(v: unknown): { value: string | null; dtype: string } {
  if (v === null || v === undefined || v === "") return { value: null, dtype: "string" };
  if (typeof v === "number") return { value: String(v), dtype: "number" };
  if (typeof v === "boolean") return { value: v ? "TRUE" : "FALSE", dtype: "bool" };
  if (v instanceof Date) return { value: v.toISOString().slice(0, 10), dtype: "date" };
  if (typeof v === "object") {
    const o = v as any;
    if (Array.isArray(o.richText)) return { value: o.richText.map((r: any) => r.text).join(""), dtype: "string" };
    if (typeof o.text === "string") return { value: o.text, dtype: "string" }; // hyperlink
    if (o.error) return { value: String(o.error), dtype: "error" };
    if ("result" in o) return fmtPrimitive(o.result); // formula envelope
  }
  return { value: String(v), dtype: "string" };
}

/** Parse the first worksheet of an XLSX buffer into sheet cells (formulas preserved). */
export async function parseXlsx(buffer: ArrayBuffer | Buffer): Promise<{ name: string; cells: XlsxCell[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("Workbook has no sheets");

  const cells: XlsxCell[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const r = rowNumber - 1;
      const c = colNumber - 1;
      const val = cell.value as any;
      if (val && typeof val === "object" && typeof val.formula === "string") {
        const { value, dtype } = fmtPrimitive(val.result);
        cells.push({ row: r, col: c, raw: `=${val.formula}`, value, dtype });
        return;
      }
      const { value, dtype } = fmtPrimitive(cell.value);
      if (value === null) return;
      cells.push({ row: r, col: c, raw: value, value, dtype });
    });
  });
  return { name: ws.name || "Sheet1", cells };
}

/** Build an XLSX buffer from sheet cells (formulas re-emitted so Excel recomputes). */
export async function buildXlsx(name: string, cells: XlsxCell[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "DClaw Sheet";
  const ws = wb.addWorksheet(name.slice(0, 31) || "Sheet1");
  for (const c of cells) {
    if (c.raw === null) continue;
    const cell = ws.getCell(c.row + 1, c.col + 1);
    if (c.raw.startsWith("=")) {
      cell.value = { formula: c.raw.slice(1), result: coerceForExport(c.value, c.dtype) } as any;
    } else {
      cell.value = coerceForExport(c.raw, c.dtype) as any;
    }
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

function coerceForExport(value: string | null, dtype: string): string | number | boolean | null {
  if (value === null) return null;
  if (dtype === "number") {
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  }
  if (dtype === "bool") return value.toUpperCase() === "TRUE";
  return value;
}

/** Sanitize a workbook name into a safe download filename (no header injection). */
export function safeFilename(name: string): string {
  const base = name.replace(/[^A-Za-z0-9._-]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "") || "sheet";
  return `${base.slice(0, 80)}.xlsx`;
}
