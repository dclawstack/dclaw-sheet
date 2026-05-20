"use client";

import { useEffect, useMemo, useState } from "react";

import { type Cell, listCells, upsertCell } from "@/lib/api";

interface SheetGridProps {
  sheetId: string;
  rowCount: number;
  columnCount: number;
}

function columnLabel(idx: number): string {
  let label = "";
  let n = idx;
  while (true) {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
    if (n < 0) break;
  }
  return label;
}

export function SheetGrid({ sheetId, rowCount, columnCount }: SheetGridProps) {
  const [cells, setCells] = useState<Record<string, Cell>>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ row: number; col: number } | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listCells(sheetId)
      .then((data) => {
        if (cancelled) return;
        const byKey: Record<string, Cell> = {};
        for (const c of data) byKey[`${c.row}:${c.column}`] = c;
        setCells(byKey);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load cells"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [sheetId]);

  const visibleRows = Math.min(rowCount, 50);
  const visibleCols = Math.min(columnCount, 12);
  const headerCols = useMemo(
    () => Array.from({ length: visibleCols }, (_, i) => columnLabel(i)),
    [visibleCols],
  );

  async function commit(row: number, col: number, value: string) {
    setEditing(null);
    const key = `${row}:${col}`;
    const existing = cells[key];
    const previous = existing?.formula ?? existing?.value ?? "";
    if (previous === value) return;
    try {
      const updated = await upsertCell(sheetId, { row, column: col, value });
      // If this cell or another formula cell may have recomputed, refetch the sheet
      // so dependent formula values stay in sync.
      if (value.trimStart().startsWith("=") || Object.values(cells).some((c) => c.formula)) {
        const fresh = await listCells(sheetId);
        const byKey: Record<string, typeof updated> = {};
        for (const c of fresh) byKey[`${c.row}:${c.column}`] = c;
        setCells(byKey);
      } else {
        setCells((prev) => ({ ...prev, [key]: updated }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save cell");
    }
  }

  if (loading) return <div className="text-gray-500 py-4">Loading cells…</div>;

  return (
    <div className="space-y-2">
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-2 text-sm text-red-800">
          {error}
        </div>
      )}
      <div className="overflow-auto border border-gray-200 rounded-md bg-white">
        <table className="border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-10 bg-gray-100 border border-gray-200 w-12 h-8" />
              {headerCols.map((label) => (
                <th
                  key={label}
                  className="sticky top-0 bg-gray-100 border border-gray-200 px-2 h-8 min-w-[100px] font-medium text-gray-600"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: visibleRows }, (_, r) => (
              <tr key={r}>
                <td className="sticky left-0 bg-gray-50 border border-gray-200 px-2 text-center w-12 font-medium text-gray-500">
                  {r + 1}
                </td>
                {Array.from({ length: visibleCols }, (_, c) => {
                  const key = `${r}:${c}`;
                  const cell = cells[key];
                  const isEditing = editing?.row === r && editing?.col === c;
                  return (
                    <td
                      key={c}
                      className="border border-gray-200 p-0 min-w-[100px] h-8"
                      onDoubleClick={() => {
                        setEditing({ row: r, col: c });
                        setDraft(cell?.formula ?? cell?.value ?? "");
                      }}
                    >
                      {isEditing ? (
                        <input
                          autoFocus
                          className="w-full h-8 px-2 outline-none border-2 border-[#10B981] font-mono"
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={() => commit(r, c, draft)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commit(r, c, draft);
                            else if (e.key === "Escape") setEditing(null);
                          }}
                        />
                      ) : (
                        <div
                          className={`px-2 h-8 leading-8 truncate cursor-cell ${
                            cell?.value?.startsWith("#") ? "text-red-600" : ""
                          } ${cell?.data_type === "number" ? "text-right" : ""}`}
                          title={cell?.formula ?? undefined}
                        >
                          {cell?.value ?? ""}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500">
        Double-click a cell to edit. Press Enter to save, Escape to cancel.
      </p>
    </div>
  );
}
