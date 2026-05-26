const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const TOKEN_KEY = "dclaw_sheet_auth_token";

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

function authHeader(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...authHeader(),
      ...options?.headers,
    },
    ...options,
  });
  if (!response.ok) {
    const error = await response.text();
    throw new ApiError(`API error ${response.status}: ${error}`, response.status);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json();
}

export interface Workbook {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkbookList {
  items: Workbook[];
  total: number;
}

export interface Sheet {
  id: string;
  workbook_id: string;
  name: string;
  position: number;
  row_count: number;
  column_count: number;
  source_connection_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Cell {
  id: string;
  sheet_id: string;
  row: number;
  column: number;
  value: string | null;
  formula: string | null;
  data_type: string;
  updated_at: string;
}

export interface CellUpsert {
  row: number;
  column: number;
  value: string | null;
  formula?: string | null;
  data_type?: string;
}

export async function getHealth() {
  return fetchJson<{ status: string }>("/health/");
}

export async function listWorkbooks(limit = 50, offset = 0) {
  return fetchJson<WorkbookList>(`/api/v1/workbooks?limit=${limit}&offset=${offset}`);
}

export async function createWorkbook(name: string, description?: string) {
  return fetchJson<Workbook>("/api/v1/workbooks", {
    method: "POST",
    body: JSON.stringify({ name, description: description ?? null }),
  });
}

export async function getWorkbook(id: string) {
  return fetchJson<Workbook>(`/api/v1/workbooks/${id}`);
}

export async function deleteWorkbook(id: string) {
  return fetchJson<void>(`/api/v1/workbooks/${id}`, { method: "DELETE" });
}

export async function listSheets(workbookId: string) {
  return fetchJson<Sheet[]>(`/api/v1/workbooks/${workbookId}/sheets`);
}

export async function createSheet(workbookId: string, name: string) {
  return fetchJson<Sheet>(`/api/v1/workbooks/${workbookId}/sheets`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function listCells(sheetId: string) {
  return fetchJson<Cell[]>(`/api/v1/sheets/${sheetId}/cells`);
}

export async function upsertCell(sheetId: string, payload: CellUpsert) {
  return fetchJson<Cell>(`/api/v1/sheets/${sheetId}/cells`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function bulkUpsertCells(sheetId: string, cells: CellUpsert[]) {
  return fetchJson<Cell[]>(`/api/v1/sheets/${sheetId}/cells`, {
    method: "PATCH",
    body: JSON.stringify({ cells }),
  });
}

export async function importCsv(workbookId: string, file: File, sheetName: string) {
  const form = new FormData();
  form.append("file", file);
  form.append("sheet_name", sheetName);
  const url = `${API_BASE}/api/v1/workbooks/${workbookId}/import/csv`;
  const response = await fetch(url, { method: "POST", body: form, headers: authHeader() });
  if (!response.ok) {
    const text = await response.text();
    throw new ApiError(`API error ${response.status}: ${text}`, response.status);
  }
  return response.json() as Promise<Sheet>;
}

export async function importXlsx(workbookId: string, file: File, sheetName?: string) {
  const form = new FormData();
  form.append("file", file);
  if (sheetName) form.append("sheet_name", sheetName);
  const url = `${API_BASE}/api/v1/workbooks/${workbookId}/import/xlsx`;
  const response = await fetch(url, { method: "POST", body: form, headers: authHeader() });
  if (!response.ok) {
    const text = await response.text();
    throw new ApiError(`API error ${response.status}: ${text}`, response.status);
  }
  return response.json() as Promise<Sheet[]>;
}

export function sheetExportUrl(sheetId: string): string {
  return `${API_BASE}/api/v1/sheets/${sheetId}/export.xlsx`;
}

export async function recommendChart(
  sheetId: string,
  start: string,
  end: string,
  hasHeader = true,
) {
  return fetchJson<{ vega_lite: unknown }>(
    `/api/v1/sheets/${sheetId}/chart?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&has_header=${hasHeader}`,
  );
}

export interface CopilotToolCall {
  tool: string;
  [key: string]: unknown;
}

export interface CopilotResponse {
  provider: string;
  message: string;
  tool_calls: CopilotToolCall[];
}

export async function copilotAsk(sheetId: string, prompt: string) {
  return fetchJson<CopilotResponse>(`/api/v1/ai/sheets/${sheetId}/copilot`, {
    method: "POST",
    body: JSON.stringify({ prompt }),
  });
}

export type ConnectionType = "postgres" | "csv_url";

export interface Connection {
  id: string;
  name: string;
  type: ConnectionType;
  last_synced_at: string | null;
  last_row_count: number | null;
  created_at: string;
  updated_at: string;
}

export interface ConnectionWithConfig extends Connection {
  config: Record<string, unknown>;
}

export interface DriftReport {
  added: string[];
  removed: string[];
  reordered: boolean;
  is_first_sync: boolean;
  has_drift: boolean;
}

export interface SyncResult {
  sheet: Sheet;
  drift: DriftReport;
}

export async function listConnections() {
  return fetchJson<Connection[]>("/api/v1/connections");
}

export async function createConnection(payload: {
  name: string;
  type: ConnectionType;
  config: Record<string, unknown>;
}) {
  return fetchJson<Connection>("/api/v1/connections", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getConnection(id: string) {
  return fetchJson<ConnectionWithConfig>(`/api/v1/connections/${id}`);
}

export async function deleteConnection(id: string) {
  return fetchJson<void>(`/api/v1/connections/${id}`, { method: "DELETE" });
}

export async function syncConnectionIntoWorkbook(connectionId: string, workbookId: string) {
  return fetchJson<SyncResult>(
    `/api/v1/connections/${connectionId}/sync/${workbookId}`,
    { method: "POST" },
  );
}

export async function refreshLinkedSheet(sheetId: string) {
  return fetchJson<SyncResult>(`/api/v1/connections/refresh/sheets/${sheetId}`, {
    method: "POST",
  });
}

export interface TelemetryEvent {
  id: string;
  event_type: string;
  user_id: string | null;
  workbook_id: string | null;
  sheet_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export interface DailyCount {
  day: string;
  count: number;
}

export interface TypeCount {
  event_type: string;
  count: number;
}

export interface TelemetrySummary {
  total_events: number;
  events_today: number;
  daily_counts: DailyCount[];
  by_type: TypeCount[];
  daily_active_workbooks: DailyCount[];
}

export async function listEvents(limit = 100, eventType?: string) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (eventType) params.set("event_type", eventType);
  return fetchJson<{ items: TelemetryEvent[]; total: number }>(
    `/api/v1/events?${params}`,
  );
}

export async function telemetrySummary(days = 7) {
  return fetchJson<TelemetrySummary>(`/api/v1/events/summary?days=${days}`);
}

export interface MeUser {
  id: string;
  email: string;
  name: string | null;
  external_id: string | null;
  default_workspace_id: string | null;
}

export interface MeWorkspace {
  id: string;
  org_id: string;
  name: string;
  created_at: string;
}

export interface MeResponse {
  user: MeUser;
  workspace: MeWorkspace;
  auth_provider: string;
}

export async function getMe() {
  return fetchJson<MeResponse>("/api/v1/me");
}

export { ApiError };
