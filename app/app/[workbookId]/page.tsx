"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client-api";
import type { Cell, Sheet } from "@/lib/types";
import { Grid } from "@/components/grid";
import { Panels } from "@/components/panels";
import { Button } from "@/components/ui/button";

export default function WorkbookPage({ params }: { params: { workbookId: string } }) {
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [cells, setCells] = useState<Cell[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPanels, setShowPanels] = useState(true);
  const [gridVersion, setGridVersion] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadSheet = useCallback(async (sheetId: string) => {
    const { cells } = await api.getSheet(sheetId);
    setCells(cells);
    setActiveId(sheetId);
    setGridVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const s = await api.listSheets(params.workbookId);
        setSheets(s);
        if (s.length > 0) await loadSheet(s[0].id);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [params.workbookId, loadSheet]);

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !activeId) return;
    const text = await file.text();
    try {
      await api.importCsv(activeId, text, true);
      await loadSheet(activeId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (loading) return <main className="p-12 text-muted-foreground">Loading…</main>;

  return (
    <main className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-3">
          <Link href="/app" className="text-sm text-muted-foreground hover:underline">
            ← Workbooks
          </Link>
          <span className="font-semibold">Sheet</span>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".csv" hidden onChange={onImport} />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            Import CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowPanels((s) => !s)}>
            {showPanels ? "Hide panels" : "SQL / Pivot"}
          </Button>
        </div>
      </header>

      {error && (
        <div className="border-b border-destructive/40 bg-destructive/10 px-6 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-center gap-1 border-b bg-muted/30 px-4 py-1">
        {sheets.map((s) => (
          <button
            key={s.id}
            onClick={() => loadSheet(s.id)}
            className={`rounded px-3 py-1 text-sm ${
              activeId === s.id ? "bg-white font-medium shadow-sm" : "text-muted-foreground hover:bg-white/50"
            }`}
          >
            {s.name}
          </button>
        ))}
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-auto p-4">
          {activeId && <Grid key={`${activeId}-${gridVersion}`} sheetId={activeId} initialCells={cells} />}
        </div>
        {showPanels && activeId && (
          <aside className="w-[44%] min-w-[380px] border-l bg-muted/10">
            <Panels sheetId={activeId} onMutated={() => loadSheet(activeId)} />
          </aside>
        )}
      </div>
    </main>
  );
}
