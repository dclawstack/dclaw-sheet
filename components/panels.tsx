"use client";

import { useState } from "react";
import { SqlPanel } from "@/components/sql-panel";
import { PivotPanel } from "@/components/pivot-panel";
import { CopilotPanel } from "@/components/copilot-panel";

type Tab = "copilot" | "sql" | "pivot";

const TABS: { id: Tab; label: string }[] = [
  { id: "copilot", label: "✨ Copilot" },
  { id: "sql", label: "SQL" },
  { id: "pivot", label: "Pivot" },
];

export function Panels({ sheetId, onMutated }: { sheetId: string; onMutated?: () => void }) {
  const [tab, setTab] = useState<Tab>("copilot");
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b px-3 py-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded px-3 py-1 text-sm ${
              tab === t.id ? "bg-brand/10 font-medium text-brand" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden p-3">
        {/* key forces a fresh DuckDB load when the sheet changes */}
        {tab === "copilot" && <CopilotPanel key={`cop-${sheetId}`} sheetId={sheetId} onMutated={onMutated} />}
        {tab === "sql" && <SqlPanel key={`sql-${sheetId}`} sheetId={sheetId} />}
        {tab === "pivot" && <PivotPanel key={`pivot-${sheetId}`} sheetId={sheetId} />}
      </div>
    </div>
  );
}
