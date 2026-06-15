/** Infer column types from tabular rows and recommend a Vega-Lite spec. */

export type VLType = "quantitative" | "temporal" | "nominal";

export interface FieldInfo {
  name: string;
  type: VLType;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/;

export function inferFields(rows: Record<string, unknown>[]): FieldInfo[] {
  if (rows.length === 0) return [];
  const names = Object.keys(rows[0]);
  return names.map((name) => {
    let numeric = 0;
    let temporal = 0;
    let seen = 0;
    for (const r of rows.slice(0, 50)) {
      const v = r[name];
      if (v === null || v === undefined || v === "") continue;
      seen++;
      if (typeof v === "number" || (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v))) numeric++;
      else if (typeof v === "string" && DATE_RE.test(v)) temporal++;
    }
    if (seen === 0) return { name, type: "nominal" as VLType };
    if (temporal / seen > 0.6) return { name, type: "temporal" };
    if (numeric / seen > 0.8) return { name, type: "quantitative" };
    return { name, type: "nominal" };
  });
}

export interface ChartSpec {
  mark: "bar" | "line" | "point";
  encoding: Record<string, unknown>;
  $schema: string;
  data: { values: Record<string, unknown>[] };
  width: "container";
  height: number;
}

/**
 * Recommend a chart: a temporal/nominal dimension on x, the first quantitative
 * measure on y. Temporal x → line, otherwise bar; falls back to a scatter of two
 * quantitatives.
 */
export function recommendChart(
  rows: Record<string, unknown>[],
  opts?: { x?: string; y?: string; mark?: ChartSpec["mark"] }
): ChartSpec | null {
  if (rows.length === 0) return null;
  const fields = inferFields(rows);
  const quant = fields.filter((f) => f.type === "quantitative");
  const temporal = fields.filter((f) => f.type === "temporal");
  const nominal = fields.filter((f) => f.type === "nominal");

  let xField = opts?.x ? fields.find((f) => f.name === opts.x) : undefined;
  let yField = opts?.y ? fields.find((f) => f.name === opts.y) : undefined;

  if (!xField) xField = temporal[0] ?? nominal[0] ?? quant[1] ?? quant[0];
  if (!yField) yField = quant.find((f) => f.name !== xField?.name) ?? quant[0];
  if (!xField || !yField) return null;

  const mark: ChartSpec["mark"] =
    opts?.mark ?? (xField.type === "temporal" ? "line" : xField.type === "quantitative" ? "point" : "bar");

  return {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    data: { values: rows },
    mark,
    width: "container",
    height: 320,
    encoding: {
      x: { field: xField.name, type: xField.type, title: xField.name },
      y: { field: yField.name, type: yField.type, title: yField.name, aggregate: xField.type === "nominal" ? "sum" : undefined },
    },
  };
}
