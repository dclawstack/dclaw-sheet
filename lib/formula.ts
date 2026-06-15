import { HyperFormula } from "hyperformula";

export interface ChangedCell {
  row: number;
  col: number;
  raw: string | null;
  value: string | null;
  dtype: string;
}

interface InitCell {
  row: number;
  col: number;
  raw: string;
}

function fmtValue(v: unknown): { value: string | null; dtype: string } {
  if (v === null || v === undefined || v === "") return { value: null, dtype: "string" };
  if (typeof v === "number") return { value: String(v), dtype: "number" };
  if (typeof v === "boolean") return { value: v ? "TRUE" : "FALSE", dtype: "bool" };
  // HyperFormula DetailedCellError exposes a `.value` like "#DIV/0!"
  if (typeof v === "object" && v !== null && "value" in (v as any)) {
    return { value: String((v as any).value), dtype: "error" };
  }
  const s = String(v);
  if (s.startsWith("#") && s.endsWith("!")) return { value: s, dtype: "error" };
  return { value: s, dtype: "string" };
}

/**
 * Wraps a HyperFormula instance scoped to a single sheet. The grid keeps one of
 * these in memory; edits return the set of cells that changed (incl. dependents)
 * so the UI can repaint and the client can persist just the delta.
 */
export class FormulaSheet {
  private hf: HyperFormula;
  private sid: number;

  constructor(rows: number, cols: number, initial: InitCell[]) {
    let maxRow = rows - 1;
    let maxCol = cols - 1;
    for (const c of initial) {
      if (c.row > maxRow) maxRow = c.row;
      if (c.col > maxCol) maxCol = c.col;
    }
    const data: (string | null)[][] = Array.from({ length: maxRow + 1 }, () =>
      Array.from({ length: maxCol + 1 }, () => null)
    );
    for (const c of initial) data[c.row][c.col] = c.raw;

    this.hf = HyperFormula.buildEmpty({ licenseKey: "gpl-v3" });
    this.hf.addSheet("main");
    this.sid = this.hf.getSheetId("main")!;
    this.hf.setSheetContent(this.sid, data);
  }

  /** Apply an edit; returns every cell whose displayed value changed. */
  setCell(row: number, col: number, raw: string): ChangedCell[] {
    const content = raw === "" ? null : raw;
    const changes = this.hf.setCellContents({ sheet: this.sid, row, col }, [[content]]);
    const out: ChangedCell[] = [];
    for (const ch of changes as any[]) {
      const addr = ch.address;
      if (!addr || addr.sheet !== this.sid) continue;
      const { value, dtype } = fmtValue(ch.newValue);
      out.push({
        row: addr.row,
        col: addr.col,
        raw: this.getRaw(addr.row, addr.col),
        value,
        dtype,
      });
    }
    // The edited cell itself may not appear in `changes` if value was unchanged; ensure it's included.
    if (!out.some((c) => c.row === row && c.col === col)) {
      const { value, dtype } = fmtValue(this.hf.getCellValue({ sheet: this.sid, row, col }));
      out.push({ row, col, raw: content, value, dtype });
    }
    return out;
  }

  getRaw(row: number, col: number): string | null {
    const s = this.hf.getCellSerialized({ sheet: this.sid, row, col });
    return s === null || s === undefined ? null : String(s);
  }

  getDisplay(row: number, col: number): string {
    const { value } = fmtValue(this.hf.getCellValue({ sheet: this.sid, row, col }));
    return value ?? "";
  }

  destroy() {
    this.hf.destroy();
  }
}
