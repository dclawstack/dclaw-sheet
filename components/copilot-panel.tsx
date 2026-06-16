"use client";

import { useState } from "react";
import { loadDuckDBFromSheet } from "@/lib/duckdb";
import { recommendChart, type ChartSpec } from "@/lib/charts";
import { FormulaSheet } from "@/lib/formula";
import { letterToCol } from "@/lib/cells";
import { api } from "@/lib/client-api";
import type { ToolCall, CopilotResult } from "@/lib/ai/copilot";
import { ChartView } from "@/components/chart-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Turn {
  question: string;
  message: string;
  toolCalls: ToolCall[];
  rows?: Record<string, unknown>[];
  cols?: string[];
  chart?: ChartSpec | null;
  agreement?: number | null;
  error?: string;
}

export function CopilotPanel({ sheetId, onMutated }: { sheetId: string; onMutated?: () => void }) {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function ask() {
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setQuestion("");
    setStatus("");
    const turn: Turn = { question: q, message: "", toolCalls: [] };
    try {
      // Stream server progress (planning → consensus SQL), then execute the plan.
      let plan: CopilotResult | null = null;
      await api.copilotStream(sheetId, q, (e) => {
        if (e.type === "status") setStatus(e.message);
        else if (e.type === "plan") plan = e.plan;
        else if (e.type === "error") throw new Error(e.error);
      });
      setStatus("");
      if (!plan) throw new Error("No plan returned");
      const planned: CopilotResult = plan; // pin to const: narrowing survives the awaits below
      turn.message = planned.message;
      turn.toolCalls = planned.toolCalls;

      // Execute the plan client-side.
      const sqlCall = planned.toolCalls.find((t) => t.tool === "run_sql") as Extract<ToolCall, { tool: "run_sql" }> | undefined;
      if (sqlCall) {
        turn.agreement = sqlCall.agreement;
        const handle = await loadDuckDBFromSheet(sheetId);
        try {
          const res = await handle.conn.query(sqlCall.sql);
          turn.rows = res.toArray().map((r) => ({ ...r }));
          turn.cols = res.schema.fields.map((f) => f.name);
        } finally {
          await handle.terminate();
        }
      }

      const chartCall = planned.toolCalls.find((t) => t.tool === "make_chart") as Extract<ToolCall, { tool: "make_chart" }> | undefined;
      if (chartCall && turn.rows && turn.rows.length > 0) {
        turn.chart = recommendChart(turn.rows, { x: chartCall.x, y: chartCall.y, mark: chartCall.mark });
      }

      const formulaCall = planned.toolCalls.find((t) => t.tool === "write_formula") as Extract<ToolCall, { tool: "write_formula" }> | undefined;
      if (formulaCall) {
        await applyFormula(sheetId, formulaCall.cell, formulaCall.formula);
        onMutated?.();
      }
    } catch (e: any) {
      turn.error = String(e?.message ?? e);
    } finally {
      setStatus("");
      setTurns((prev) => [...prev, turn]);
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex-1 space-y-4 overflow-auto">
        {turns.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Ask a question about your data — e.g. <em>&ldquo;MRR by month&rdquo;</em> or{" "}
            <em>&ldquo;top 5 customers by revenue&rdquo;</em>. The copilot writes the SQL (multi-model
            consensus), runs it, and charts it.
          </p>
        )}
        {turns.map((t, i) => (
          <div key={i} className="space-y-2">
            <div className="rounded-md bg-brand/5 px-3 py-2 text-sm font-medium">{t.question}</div>
            {t.error ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{t.error}</div>
            ) : (
              <>
                <p className="text-sm">{t.message}</p>
                {t.toolCalls.map((tc, j) => (
                  <ToolCard key={j} tc={tc} agreement={t.agreement} />
                ))}
                {t.chart && (
                  <div className="rounded-md border p-3">
                    <ChartView spec={t.chart} />
                  </div>
                )}
                {t.rows && t.rows.length > 0 && (
                  <ResultTable cols={t.cols ?? []} rows={t.rows.slice(0, 50)} />
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {busy && status && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
          {status}
        </div>
      )}
      <div className="flex gap-2 border-t pt-3">
        <Input
          placeholder="Ask your data…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask()}
          disabled={busy}
        />
        <Button onClick={ask} disabled={busy} className="bg-brand text-brand-foreground hover:bg-brand/90">
          {busy ? "Thinking…" : "Ask"}
        </Button>
      </div>
    </div>
  );
}

function ToolCard({ tc, agreement }: { tc: ToolCall; agreement?: number | null }) {
  if (tc.tool === "run_sql") {
    return (
      <div className="rounded-md border bg-muted/20 p-2">
        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>SQL (consensus){tc.explanation ? ` · ${tc.explanation}` : ""}</span>
          {agreement != null && (
            <span className="rounded bg-brand/10 px-1.5 py-0.5 text-brand">{Math.round(agreement * 100)}% agree</span>
          )}
        </div>
        <pre className="overflow-auto whitespace-pre-wrap font-mono text-xs">{tc.sql}</pre>
      </div>
    );
  }
  if (tc.tool === "make_chart") return <div className="text-xs text-muted-foreground">📊 chart: {tc.mark ?? "auto"}</div>;
  if (tc.tool === "write_formula")
    return <div className="text-xs text-muted-foreground">✎ {tc.cell} = {tc.formula} (applied)</div>;
  return (
    <div className="rounded-md border bg-muted/20 p-2 text-xs">
      <div className="mb-1 font-medium">Suggested cleaning</div>
      <ul className="list-disc pl-4">{tc.steps.map((s, i) => <li key={i}>{s}</li>)}</ul>
    </div>
  );
}

function ResultTable({ cols, rows }: { cols: string[]; rows: Record<string, unknown>[] }) {
  return (
    <div className="max-h-60 overflow-auto rounded-md border">
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 bg-muted/60">
          <tr>{cols.map((c) => <th key={c} className="border px-2 py-1 text-left">{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{cols.map((c) => <td key={c} className="border px-2 py-1">{r[c] === null || r[c] === undefined ? "" : String(r[c])}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Apply an AI formula to a cell, computing its value + dependents and persisting. */
async function applyFormula(sheetId: string, cellRef: string, formula: string) {
  const m = cellRef.match(/^([A-Za-z]+)(\d+)$/);
  if (!m) throw new Error(`Bad cell reference: ${cellRef}`);
  const col = letterToCol(m[1]);
  const row = parseInt(m[2], 10) - 1;
  const { cells } = await api.getSheet(sheetId);
  const fs = new FormulaSheet(
    row + 2,
    col + 2,
    cells.filter((c) => c.raw !== null).map((c) => ({ row: c.row, col: c.col, raw: c.raw as string }))
  );
  const changed = fs.setCell(row, col, formula);
  fs.destroy();
  await api.saveCells(
    sheetId,
    changed.map((c) => ({ row: c.row, col: c.col, raw: c.raw, value: c.value, dtype: c.dtype }))
  );
}
