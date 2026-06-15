/**
 * Minimal RFC-4180-ish CSV parser (handles quoted fields, escaped quotes, CRLF).
 * Stdlib-only — we don't pull a dependency for this.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  // trailing field/row
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0].trim() !== ""));
}

/** Infer a coarse dtype for a raw string value (matches schema.cells.dtype). */
export function inferDtype(value: string): "number" | "bool" | "date" | "string" {
  const v = value.trim();
  if (v === "") return "string";
  if (/^-?\d+(\.\d+)?$/.test(v)) return "number";
  if (/^(true|false)$/i.test(v)) return "bool";
  if (/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/.test(v)) return "date";
  return "string";
}
