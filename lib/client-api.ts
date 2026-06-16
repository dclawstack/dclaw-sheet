"use client";

import type { Cell, CellPatch, Sheet, Workbook } from "./types";
import type { CopilotResult } from "./ai/copilot";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  listWorkbooks: () => req<Workbook[]>("/api/workbooks"),
  createWorkbook: (name: string) =>
    req<Workbook>("/api/workbooks", { method: "POST", body: JSON.stringify({ name }) }),
  deleteWorkbook: (id: string) => req<{ deleted: boolean }>(`/api/workbooks/${id}`, { method: "DELETE" }),
  renameWorkbook: (id: string, name: string) =>
    req<Workbook>(`/api/workbooks/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),

  listSheets: (workbookId: string) => req<Sheet[]>(`/api/workbooks/${workbookId}/sheets`),
  createSheet: (workbookId: string, name: string) =>
    req<Sheet>(`/api/workbooks/${workbookId}/sheets`, { method: "POST", body: JSON.stringify({ name }) }),

  getSheet: (sheetId: string) => req<{ sheet: Sheet; cells: Cell[] }>(`/api/sheets/${sheetId}`),
  saveCells: (sheetId: string, cells: CellPatch[]) =>
    req<{ upserted: number; deleted: number }>(`/api/sheets/${sheetId}/cells`, {
      method: "PUT",
      body: JSON.stringify({ cells }),
    }),
  importCsv: (sheetId: string, csv: string, hasHeader = true) =>
    req<{ rows: number; cols: number; cells: number }>(`/api/sheets/${sheetId}/import-csv`, {
      method: "POST",
      body: JSON.stringify({ csv, hasHeader }),
    }),
  importXlsx: async (sheetId: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/sheets/${sheetId}/import-xlsx`, { method: "POST", body: fd });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Import failed (${res.status})`);
    return res.json() as Promise<{ cells: number; source: string }>;
  },
  exportXlsxUrl: (sheetId: string) => `/api/sheets/${sheetId}/export-xlsx`,

  copilot: (sheetId: string, question: string) =>
    req<CopilotResult>("/api/ai/copilot", { method: "POST", body: JSON.stringify({ sheetId, question }) }),

  /** Streaming copilot. Calls onEvent for each SSE message; resolves when the stream ends. */
  copilotStream: async (
    sheetId: string,
    question: string,
    onEvent: (e: { type: "status"; message: string } | { type: "plan"; plan: CopilotResult } | { type: "error"; error: string } | { type: "done" }) => void
  ) => {
    const res = await fetch("/api/ai/copilot/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sheetId, question }),
    });
    if (!res.ok || !res.body) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? `Copilot failed (${res.status})`);
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const line = chunk.split("\n").find((l) => l.startsWith("data:"));
        if (!line) continue;
        let evt: any;
        try {
          evt = JSON.parse(line.slice(5).trim());
        } catch {
          continue; // ignore malformed frame
        }
        onEvent(evt); // errors thrown here propagate to the caller intentionally
      }
    }
  },
  generateSql: (sheetId: string, question: string) =>
    req<{ sql: string; explanation: string; agreement: number | null }>("/api/ai/sql", {
      method: "POST",
      body: JSON.stringify({ sheetId, question }),
    }),

  seedDemo: () => req<{ workbookId: string; sheetId: string; rows: number }>("/api/demo/seed", { method: "POST" }),
  listConnections: () =>
    req<{ id: string; name: string; kind: string; status: string; lastSyncedAt: string | null }[]>("/api/connections"),
  createConnection: (name: string, config: Record<string, unknown>) =>
    req<{ id: string }>("/api/connections", { method: "POST", body: JSON.stringify({ name, config }) }),
  syncConnection: (id: string, workbookId?: string) =>
    req<{ workbookId: string; sheetId: string; rows: number; drift: unknown }>(`/api/connections/${id}/sync`, {
      method: "POST",
      body: JSON.stringify({ workbookId }),
    }),
};
