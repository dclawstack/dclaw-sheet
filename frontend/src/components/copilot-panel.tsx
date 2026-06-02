"use client";

import { useState } from "react";
import { Bot, Send, X, Sparkles } from "lucide-react";

import {
  copilotAsk,
  upsertCell,
  type CopilotResponse,
  type CopilotToolCall,
} from "@/lib/api";

interface CopilotPanelProps {
  sheetId: string;
  onClose?: () => void;
  onMutated?: () => void;
  onChartRequest?: (range: { start: string; end: string }) => void;
}

interface ChatTurn {
  role: "user" | "assistant";
  message: string;
  provider?: string;
  toolCalls?: CopilotToolCall[];
}

export function CopilotPanel({ sheetId, onClose, onMutated, onChartRequest }: CopilotPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [history, setHistory] = useState<ChatTurn[]>([
    {
      role: "assistant",
      message:
        "Hi! Try: 'sum revenue', 'average price', 'chart this', or 'clean up text columns'.",
    },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const text = prompt.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    setPrompt("");
    setHistory((h) => [...h, { role: "user", message: text }]);
    try {
      const resp: CopilotResponse = await copilotAsk(sheetId, text);
      setHistory((h) => [
        ...h,
        {
          role: "assistant",
          message: resp.message,
          provider: resp.provider,
          toolCalls: resp.tool_calls,
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Copilot failed");
    } finally {
      setBusy(false);
    }
  }

  async function applyTool(call: CopilotToolCall) {
    setBusy(true);
    setError(null);
    try {
      if (call.tool === "write_formula") {
        await upsertCell(sheetId, {
          row: Number(call.row),
          column: Number(call.column),
          value: null,
          formula: String(call.formula),
          data_type: "formula",
        });
        onMutated?.();
      } else if (call.tool === "make_chart") {
        onChartRequest?.({ start: String(call.start), end: String(call.end) });
      } else {
        setError(`Tool '${call.tool}' isn't applied automatically yet.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Apply failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg bg-white border border-gray-200 shadow-sm flex flex-col h-[600px]">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-[#10B981]" />
          <h3 className="font-semibold text-gray-900">Sheet Copilot</h3>
        </div>
        {onClose && (
          <button onClick={onClose} aria-label="Close" className="text-gray-600 hover:text-gray-700">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
        {history.map((turn, idx) => (
          <div
            key={idx}
            className={turn.role === "user" ? "flex justify-end" : "flex justify-start"}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 ${
                turn.role === "user"
                  ? "bg-[#10B981] text-white"
                  : "bg-gray-100 text-gray-900"
              }`}
            >
              <div>{turn.message}</div>
              {turn.provider && (
                <div className="mt-1 text-[10px] uppercase tracking-wider opacity-60">
                  via {turn.provider}
                </div>
              )}
              {turn.toolCalls && turn.toolCalls.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {turn.toolCalls.map((call, i) => (
                    <div
                      key={i}
                      className="rounded border border-gray-200 bg-white p-2 text-gray-800"
                    >
                      <div className="font-mono text-xs text-gray-600 mb-1">
                        {call.tool}
                        {call.tool === "write_formula" && (
                          <span className="ml-2 text-gray-600">
                            row {String(call.row)}, col {String(call.column)}
                          </span>
                        )}
                      </div>
                      {call.tool === "write_formula" && (
                        <code className="text-xs">{String(call.formula)}</code>
                      )}
                      {call.tool === "make_chart" && (
                        <code className="text-xs">
                          {String(call.start)}:{String(call.end)}
                        </code>
                      )}
                      {call.tool === "run_sql" && (
                        <code className="text-xs">{String(call.query)}</code>
                      )}
                      {call.tool === "propose_clean" && (
                        <code className="text-xs">action: {String(call.action)}</code>
                      )}
                      <button
                        onClick={() => applyTool(call)}
                        disabled={busy}
                        className="mt-2 rounded-md bg-[#10B981] px-2 py-1 text-[11px] text-white font-medium hover:bg-[#0E9F6E] disabled:opacity-50 flex items-center gap-1"
                      >
                        <Sparkles className="h-3 w-3" />
                        Apply
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 p-2 text-sm text-red-800">
            {error}
          </div>
        )}
      </div>

      <div className="border-t border-gray-100 p-3 flex gap-2">
        <input
          aria-label="Ask the copilot"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          placeholder="Ask the copilot…"
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981] outline-none"
          disabled={busy}
        />
        <button
          onClick={send}
          disabled={busy || !prompt.trim()}
          className="rounded-md bg-[#10B981] px-3 py-2 text-sm text-white font-medium hover:bg-[#0E9F6E] disabled:opacity-50 flex items-center gap-1"
        >
          <Send className="h-3.5 w-3.5" />
          Send
        </button>
      </div>
    </div>
  );
}
