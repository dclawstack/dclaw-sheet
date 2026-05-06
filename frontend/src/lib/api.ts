export interface Spreadsheet {
  id: string;
  name: string;
  row_count: number;
  column_count: number;
  summary: string;
  status: string;
  created_at: string;
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `/api/v1${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}
