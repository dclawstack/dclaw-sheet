// DEMO-SEED-CONTROLS — landing-page controls to seed/clear demo data.
// Self-contained; delete this file + the DEMO-SEED-CONTROLS block in
// frontend/src/app/page.tsx + frontend/src/lib/demo-seed.ts to remove.
"use client";

import { useState } from "react";
import { Database, Loader2, Trash2, Sparkles } from "lucide-react";

import {
  clearDemoData,
  seedDemoData,
  type DemoClearReport,
  type DemoSeedReport,
} from "@/lib/demo-seed";

type Status =
  | { kind: "idle" }
  | { kind: "running"; op: "seed" | "clear" }
  | { kind: "seeded"; report: DemoSeedReport }
  | { kind: "cleared"; report: DemoClearReport }
  | { kind: "error"; message: string };

export function DemoControls() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [confirmingClear, setConfirmingClear] = useState(false);

  const busy = status.kind === "running";

  async function onSeed() {
    setStatus({ kind: "running", op: "seed" });
    try {
      const report = await seedDemoData();
      setStatus({ kind: "seeded", report });
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "Seed failed",
      });
    }
  }

  async function onClear() {
    if (!confirmingClear) {
      setConfirmingClear(true);
      return;
    }
    setConfirmingClear(false);
    setStatus({ kind: "running", op: "clear" });
    try {
      const report = await clearDemoData();
      setStatus({ kind: "cleared", report });
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "Clear failed",
      });
    }
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/50 px-5 py-4">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="h-8 w-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-[240px]">
          <h3 className="text-sm font-semibold text-gray-900">Demo data</h3>
          <p className="mt-0.5 text-xs text-gray-600">
            Seed example workbooks (SaaS metrics, runway, pipeline, cohorts, P&amp;L) plus a
            connection and validation rules — or wipe everything for a clean slate.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSeed}
            disabled={busy}
            className="rounded-md bg-[#10B981] hover:bg-[#0E9F6E] text-white px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
          >
            {status.kind === "running" && status.op === "seed" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Database className="h-3.5 w-3.5" />
            )}
            Seed demo data
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={busy}
            onBlur={() => setConfirmingClear(false)}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 disabled:opacity-50 ${
              confirmingClear
                ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {status.kind === "running" && status.op === "clear" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            {confirmingClear ? "Click again to confirm" : "Clear all data"}
          </button>
        </div>
      </div>

      {status.kind === "seeded" && (
        <div className="mt-3 rounded-md bg-white border border-emerald-200 px-3 py-2 text-xs text-emerald-800">
          Seeded {status.report.workbooks_created} workbooks ·{" "}
          {status.report.sheets_created} sheets · {status.report.connections_created} connection
          · {status.report.validation_rules_created} validation rules.{" "}
          <a href="/app" className="underline font-medium">
            Open the app →
          </a>
        </div>
      )}
      {status.kind === "cleared" && (
        <div className="mt-3 rounded-md bg-white border border-gray-200 px-3 py-2 text-xs text-gray-700">
          Cleared {status.report.workbooks_deleted} workbooks and{" "}
          {status.report.connections_deleted} connections.
        </div>
      )}
      {status.kind === "error" && (
        <div className="mt-3 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">
          {status.message}
        </div>
      )}
    </div>
  );
}
