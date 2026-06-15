"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FormulaSheet } from "@/lib/formula";
import { colToLetter, cellKey } from "@/lib/cells";
import { api } from "@/lib/client-api";
import type { Cell } from "@/lib/types";

interface Display {
  value: string;
  dtype: string;
}

export function Grid({
  sheetId,
  initialCells,
}: {
  sheetId: string;
  initialCells: Cell[];
}) {
  const fsRef = useRef<FormulaSheet | null>(null);
  const [display, setDisplay] = useState<Map<string, Display>>(new Map());
  const [raws, setRaws] = useState<Map<string, string>>(new Map());
  const [editing, setEditing] = useState<{ row: number; col: number } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { rows, cols } = useMemo(() => {
    let maxRow = 0;
    let maxCol = 0;
    for (const c of initialCells) {
      if (c.row > maxRow) maxRow = c.row;
      if (c.col > maxCol) maxCol = c.col;
    }
    return {
      rows: Math.min(Math.max(maxRow + 2, 30), 500),
      cols: Math.min(Math.max(maxCol + 2, 12), 60),
    };
  }, [initialCells]);

  // Build the formula engine + initial display once per sheet.
  useEffect(() => {
    const fs = new FormulaSheet(
      rows,
      cols,
      initialCells.filter((c) => c.raw !== null).map((c) => ({ row: c.row, col: c.col, raw: c.raw as string }))
    );
    fsRef.current = fs;
    const d = new Map<string, Display>();
    const r = new Map<string, string>();
    for (const c of initialCells) {
      if (c.raw !== null) r.set(cellKey(c.row, c.col), c.raw);
      d.set(cellKey(c.row, c.col), { value: c.value ?? "", dtype: c.dtype });
    }
    setDisplay(d);
    setRaws(r);
    return () => fs.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetId]);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  const startEdit = useCallback(
    (row: number, col: number) => {
      setEditing({ row, col });
      setEditValue(raws.get(cellKey(row, col)) ?? "");
    },
    [raws]
  );

  const commit = useCallback(async () => {
    if (!editing || !fsRef.current) return;
    const { row, col } = editing;
    const raw = editValue;
    setEditing(null);

    const changed = fsRef.current.setCell(row, col, raw);
    setDisplay((prev) => {
      const next = new Map(prev);
      for (const c of changed) next.set(cellKey(c.row, c.col), { value: c.value ?? "", dtype: c.dtype });
      return next;
    });
    setRaws((prev) => {
      const next = new Map(prev);
      if (raw === "") next.delete(cellKey(row, col));
      else next.set(cellKey(row, col), raw);
      return next;
    });

    setSaving(true);
    try {
      await api.saveCells(
        sheetId,
        changed.map((c) => ({ row: c.row, col: c.col, raw: c.raw, value: c.value, dtype: c.dtype }))
      );
    } catch {
      /* keep optimistic UI; surfaced on next load */
    } finally {
      setSaving(false);
    }
  }, [editing, editValue, sheetId]);

  return (
    <div className="relative overflow-auto rounded-md border bg-white">
      {saving && (
        <div className="absolute right-2 top-2 z-10 rounded bg-brand/10 px-2 py-0.5 text-xs text-brand">
          saving…
        </div>
      )}
      <table className="border-collapse text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 w-10 border bg-muted/60" />
            {Array.from({ length: cols }, (_, c) => (
              <th key={c} className="min-w-[96px] border bg-muted/60 px-2 py-1 font-medium text-muted-foreground">
                {colToLetter(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, row) => (
            <tr key={row}>
              <td className="sticky left-0 z-10 border bg-muted/60 px-2 py-1 text-center text-muted-foreground">
                {row + 1}
              </td>
              {Array.from({ length: cols }, (_, col) => {
                const key = cellKey(row, col);
                const d = display.get(key);
                const isEditing = editing?.row === row && editing?.col === col;
                const isError = d?.dtype === "error";
                const isNum = d?.dtype === "number";
                return (
                  <td
                    key={col}
                    onDoubleClick={() => startEdit(row, col)}
                    className={`h-7 border px-2 ${isNum ? "text-right tabular-nums" : ""} ${
                      isError ? "bg-destructive/10 text-destructive" : ""
                    } cursor-cell`}
                  >
                    {isEditing ? (
                      <input
                        ref={inputRef}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={commit}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commit();
                          if (e.key === "Escape") setEditing(null);
                        }}
                        className="w-full min-w-[88px] bg-white outline-none"
                      />
                    ) : (
                      <span className="block min-w-[80px] truncate">{d?.value ?? ""}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
