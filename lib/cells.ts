/** Spreadsheet address helpers (0-indexed row/col <-> A1). */

export function colToLetter(col: number): string {
  let s = "";
  let n = col;
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

export function letterToCol(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

export function a1(row: number, col: number): string {
  return `${colToLetter(col)}${row + 1}`;
}

export const cellKey = (row: number, col: number) => `${row}:${col}`;

export function classifyValue(v: unknown): "number" | "bool" | "string" | "error" {
  if (typeof v === "number") return "number";
  if (typeof v === "boolean") return "bool";
  if (typeof v === "string" && v.startsWith("#") && v.endsWith("!")) return "error";
  return "string";
}
