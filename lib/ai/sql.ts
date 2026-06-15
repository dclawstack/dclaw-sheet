import { complete } from "./consensus";
import type { SheetSchema } from "@/lib/sheet-data";

export interface SqlResult {
  sql: string;
  explanation: string;
  ok: boolean;
  agreement: number | null;
  costUsd: number;
  error?: string;
}

function schemaText(schema: SheetSchema): string {
  const cols = schema.columns
    .map((c) => `  ${c.name} ${c.dtype}  -- e.g. ${c.samples.map((s) => JSON.stringify(s)).join(", ")}`)
    .join("\n");
  return `TABLE sheet (${schema.rowCount} rows)\n${cols}`;
}

/** Normalise SQL so equivalent answers from different models vote together. */
function normalizeSql(text: string): string {
  return text
    .replace(/```(?:sql)?/gi, "")
    .replace(/;\s*$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const SYSTEM = `You are a precise analytics SQL generator for DuckDB.
Rules:
- The ONLY table is "sheet" with the given columns. Never invent columns.
- Emit ONE read-only SELECT statement (no INSERT/UPDATE/DELETE/DDL).
- Use DuckDB syntax. For month bucketing use date_trunc('month', CAST(col AS DATE)).
- Quote identifiers with double quotes if they are not simple lowercase.
- Respond as strict JSON: {"sql": "...", "explanation": "one sentence"}.`;

/**
 * Generate SQL for a natural-language question against a sheet schema.
 * Runs the HARD consensus tier: a diverse model pool answers in parallel, votes
 * on the normalised SQL, and a strong arbiter breaks ties — because a wrong query
 * silently produces a wrong chart, which is the worst failure for this product.
 */
export async function generateSql(
  question: string,
  schema: SheetSchema,
  workspaceId?: string
): Promise<SqlResult> {
  const res = await complete({
    taskType: "sql_gen",
    tier: "hard",
    json: true,
    workspaceId,
    normalize: (text) => {
      try {
        const obj = JSON.parse(text.replace(/```(?:json)?/gi, "").trim());
        return normalizeSql(String(obj.sql ?? ""));
      } catch {
        return normalizeSql(text);
      }
    },
    system: SYSTEM,
    user: `${schemaText(schema)}\n\nQUESTION: ${question}\n\nReturn the JSON now.`,
  });

  const parsed = res.json as { sql?: string; explanation?: string } | null;
  const sql = (parsed?.sql ?? "").trim();
  if (!res.ok || !sql) {
    return { sql: "", explanation: "", ok: false, agreement: res.agreement, costUsd: res.costUsd, error: res.error ?? "no SQL produced" };
  }
  if (!isReadOnly(sql)) {
    return { sql: "", explanation: "", ok: false, agreement: res.agreement, costUsd: res.costUsd, error: "generated SQL was not read-only" };
  }
  return {
    sql,
    explanation: parsed?.explanation ?? "",
    ok: true,
    agreement: res.agreement,
    costUsd: res.costUsd,
  };
}

export function isReadOnly(sql: string): boolean {
  const s = sql.trim().toLowerCase();
  if (!/^(select|with)\b/.test(s)) return false;
  return !/\b(insert|update|delete|drop|alter|create|attach|copy|pragma|truncate|grant)\b/.test(s);
}
