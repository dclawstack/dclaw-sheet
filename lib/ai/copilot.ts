import { complete } from "./consensus";
import { generateSql } from "./sql";
import type { SheetSchema } from "@/lib/sheet-data";

export type ToolCall =
  | { tool: "run_sql"; intent: string; sql: string; explanation: string; agreement: number | null }
  | { tool: "make_chart"; x?: string; y?: string; mark?: "bar" | "line" | "point"; source: "last_sql" | "sheet"; explanation?: string }
  | { tool: "write_formula"; cell: string; formula: string; explanation?: string }
  | { tool: "propose_clean"; steps: string[] };

export interface CopilotResult {
  message: string;
  toolCalls: ToolCall[];
  costUsd: number;
  modelsUsed: string[];
  ok: boolean;
  error?: string;
}

function schemaText(schema: SheetSchema): string {
  const cols = schema.columns.map((c) => `${c.name} (${c.dtype})`).join(", ");
  return `Active sheet "sheet": ${schema.rowCount} rows. Columns: ${cols}.`;
}

const PLANNER_SYSTEM = `You are the copilot for an AI spreadsheet. The user asks questions about the
"sheet" table. Plan how to answer using these tools (you do NOT execute them — the app does):

- run_sql: query the data. Provide "intent" describing in plain English exactly what to compute.
  DO NOT write SQL yourself — a dedicated, higher-accuracy generator writes it.
- make_chart: visualize the most recent SQL result or the raw sheet. Set "source" to "last_sql"
  (after a run_sql) or "sheet". Optionally name x/y columns and mark (bar|line|point).
- write_formula: put a spreadsheet formula in a cell. Provide "cell" (A1 notation) and "formula".
- propose_clean: suggest data-cleaning steps (array of short strings).

Typical question → [run_sql, make_chart]. Respond as strict JSON:
{"message": "<short explanation to the user>", "toolCalls": [ {...}, ... ]}`;

/** Plan (cheap) → generate SQL for any run_sql step (hard consensus) → return executable plan. */
export async function runCopilot(
  question: string,
  schema: SheetSchema,
  workspaceId?: string
): Promise<CopilotResult> {
  const plan = await complete({
    taskType: "copilot",
    json: true,
    workspaceId,
    system: PLANNER_SYSTEM,
    user: `${schemaText(schema)}\n\nUSER: ${question}\n\nReturn the JSON plan now.`,
  });

  if (!plan.ok) {
    return { message: "", toolCalls: [], costUsd: plan.costUsd, modelsUsed: plan.modelsUsed, ok: false, error: plan.error };
  }

  const raw = (plan.json as { message?: string; toolCalls?: any[] } | null) ?? {};
  let cost = plan.costUsd;
  const out: ToolCall[] = [];

  for (const tc of Array.isArray(raw.toolCalls) ? raw.toolCalls : []) {
    if (!tc || typeof tc !== "object") continue;
    switch (tc.tool) {
      case "run_sql": {
        const intent = String(tc.intent ?? question);
        const sql = await generateSql(intent, schema, workspaceId);
        cost += sql.costUsd;
        if (sql.ok) {
          out.push({ tool: "run_sql", intent, sql: sql.sql, explanation: sql.explanation, agreement: sql.agreement });
        }
        break;
      }
      case "make_chart":
        out.push({
          tool: "make_chart",
          x: typeof tc.x === "string" ? tc.x : undefined,
          y: typeof tc.y === "string" ? tc.y : undefined,
          mark: ["bar", "line", "point"].includes(tc.mark) ? tc.mark : undefined,
          source: tc.source === "sheet" ? "sheet" : "last_sql",
          explanation: typeof tc.explanation === "string" ? tc.explanation : undefined,
        });
        break;
      case "write_formula":
        if (typeof tc.cell === "string" && typeof tc.formula === "string") {
          out.push({ tool: "write_formula", cell: tc.cell, formula: tc.formula, explanation: tc.explanation });
        }
        break;
      case "propose_clean":
        out.push({ tool: "propose_clean", steps: Array.isArray(tc.steps) ? tc.steps.map(String) : [] });
        break;
    }
  }

  return {
    message: String(raw.message ?? "Here's what I found."),
    toolCalls: out,
    costUsd: cost,
    modelsUsed: plan.modelsUsed,
    ok: true,
  };
}
