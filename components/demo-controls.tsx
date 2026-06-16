"use client";

/**
 * DEMO CONTROLS — removable. Delete this file + the <DemoControls/> usage in
 * app/page.tsx to strip the seed/clear affordances. See lib/demo/seed-data.ts.
 */
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Database, Trash2, Sparkles, Loader2 } from "lucide-react";

type State =
  | { kind: "idle" }
  | { kind: "busy"; what: "seed" | "clear" }
  | { kind: "seeded"; workbooks: number; primary: string | null }
  | { kind: "cleared" }
  | { kind: "error"; message: string };

export function DemoControls() {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function seed() {
    setState({ kind: "busy", what: "seed" });
    try {
      const r = await api.seedDemo();
      setState({ kind: "seeded", workbooks: r.total, primary: r.primaryWorkbookId });
    } catch (e: any) {
      setState({ kind: "error", message: e.message });
    }
  }

  async function clear() {
    if (!confirm("Delete ALL workbooks and connections in this workspace? This cannot be undone.")) return;
    setState({ kind: "busy", what: "clear" });
    try {
      await api.clearData();
      setState({ kind: "cleared" });
    } catch (e: any) {
      setState({ kind: "error", message: e.message });
    }
  }

  const busy = state.kind === "busy";

  return (
    <div className="rounded-2xl border border-dashed border-brand/40 bg-brand/[0.03] p-6">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-brand">
        <Database className="h-4 w-4" /> Demo data sandbox
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Load a rich demo (Stripe SaaS metrics, a formula-driven revenue model, and a product catalog)
        to explore every feature — or wipe back to a clean slate. Safe to remove before launch.
      </p>

      <div className="flex flex-wrap gap-3">
        <Button onClick={seed} disabled={busy} className="bg-brand text-brand-foreground hover:bg-brand/90">
          {busy && state.what === "seed" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          Load demo data
        </Button>
        <Button onClick={clear} disabled={busy} variant="outline">
          {busy && state.what === "clear" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
          Clear all data
        </Button>
        <Link href="/app">
          <Button variant="ghost">Open the app →</Button>
        </Link>
      </div>

      <div className="mt-3 min-h-[1.25rem] text-sm" aria-live="polite">
        {state.kind === "seeded" && (
          <span className="text-brand">
            ✓ Seeded {state.workbooks} workbooks.{" "}
            {state.primary && (
              <Link href={`/app/${state.primary}`} className="underline">
                Open SaaS Metrics →
              </Link>
            )}
          </span>
        )}
        {state.kind === "cleared" && <span className="text-muted-foreground">✓ Workspace cleared — fresh state.</span>}
        {state.kind === "error" && <span className="text-destructive">{state.message}</span>}
      </div>
    </div>
  );
}
