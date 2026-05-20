"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Upload, Plus, BarChart3, Download } from "lucide-react";

import {
  createSheet,
  getWorkbook,
  importCsv,
  importXlsx,
  listSheets,
  sheetExportUrl,
  type Sheet,
  type Workbook,
} from "@/lib/api";
import { SheetGrid } from "@/components/sheet-grid";
import { ChartPanel } from "@/components/chart-panel";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function WorkbookPage({ params }: PageProps) {
  const { id } = use(params);
  const [workbook, setWorkbook] = useState<Workbook | null>(null);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [activeSheetId, setActiveSheetId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      const [wb, sheetList] = await Promise.all([getWorkbook(id), listSheets(id)]);
      setWorkbook(wb);
      setSheets(sheetList);
      if (sheetList.length > 0 && !activeSheetId) {
        setActiveSheetId(sheetList[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load workbook");
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleAddSheet() {
    const name = prompt("Sheet name?", `Sheet${sheets.length + 1}`);
    if (!name) return;
    setBusy(true);
    try {
      const created = await createSheet(id, name);
      setSheets((prev) => [...prev, created]);
      setActiveSheetId(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create sheet");
    } finally {
      setBusy(false);
    }
  }

  async function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const created = await importCsv(id, file, file.name.replace(/\.[^/.]+$/, ""));
      const fresh = await listSheets(id);
      setSheets(fresh);
      setActiveSheetId(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "CSV import failed");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  async function handleXlsxUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const created = await importXlsx(id, file);
      const fresh = await listSheets(id);
      setSheets(fresh);
      if (created.length > 0) setActiveSheetId(created[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "XLSX import failed");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  const [showChart, setShowChart] = useState(false);

  const activeSheet = sheets.find((s) => s.id === activeSheetId) ?? null;

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-[#10B981] px-6 py-4 flex items-center gap-3">
        <Link href="/" className="text-white/80 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-semibold text-white">
          {workbook?.name ?? "Loading…"}
        </h1>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6">
        {error && (
          <div className="mb-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3 mb-4">
          <div className="flex gap-1 border-b border-gray-200 flex-1 overflow-x-auto">
            {sheets.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveSheetId(s.id)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                  s.id === activeSheetId
                    ? "border-[#10B981] text-[#10B981]"
                    : "border-transparent text-gray-600 hover:text-gray-900"
                }`}
              >
                {s.name}
              </button>
            ))}
            <button
              onClick={handleAddSheet}
              disabled={busy}
              className="px-3 py-2 text-sm text-gray-500 hover:text-gray-900 disabled:opacity-50"
              title="Add sheet"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <label className="rounded-md bg-white border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Import CSV
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleCsvUpload}
              disabled={busy}
            />
          </label>

          <label className="rounded-md bg-white border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Import XLSX
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={handleXlsxUpload}
              disabled={busy}
            />
          </label>

          {activeSheetId && (
            <a
              href={sheetExportUrl(activeSheetId)}
              className="rounded-md bg-white border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              download
            >
              <Download className="h-4 w-4" />
              Download XLSX
            </a>
          )}

          {activeSheetId && (
            <button
              onClick={() => setShowChart((v) => !v)}
              className={`rounded-md px-3 py-2 text-sm font-medium flex items-center gap-2 ${
                showChart
                  ? "bg-[#10B981] text-white hover:bg-[#0E9F6E]"
                  : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
              }`}
            >
              <BarChart3 className="h-4 w-4" />
              {showChart ? "Hide chart" : "Auto chart"}
            </button>
          )}
        </div>

        {activeSheet ? (
          <div className={showChart ? "grid grid-cols-1 lg:grid-cols-2 gap-4" : ""}>
            <SheetGrid
              key={activeSheet.id}
              sheetId={activeSheet.id}
              rowCount={activeSheet.row_count}
              columnCount={activeSheet.column_count}
            />
            {showChart && (
              <ChartPanel sheetId={activeSheet.id} onClose={() => setShowChart(false)} />
            )}
          </div>
        ) : (
          <div className="rounded-lg bg-white p-12 shadow-sm border border-gray-200 text-center text-gray-500">
            <p className="mb-4">No sheets yet.</p>
            <button
              onClick={handleAddSheet}
              className="rounded-md bg-[#10B981] px-6 py-2 text-white font-medium hover:bg-[#0E9F6E]"
            >
              Add a sheet
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
