import { parseCsv, inferDtype } from "@/lib/csv";
import { isReadOnly } from "@/lib/ai/sql";
import { env } from "@/lib/env";

export type ConnectorKind = "stripe" | "csv_url" | "postgres";

export interface SourceColumn {
  name: string;
  dtype: string;
}
export interface ConnectorData {
  headers: string[];
  rows: Record<string, unknown>[];
  schema: SourceColumn[];
  note?: string;
}

export interface StripeConfig { kind: "stripe"; apiKey?: string }
export interface CsvUrlConfig { kind: "csv_url"; url: string; hasHeader?: boolean }
export interface PostgresConfig { kind: "postgres"; connectionString: string; query: string }
export type ConnectorConfig = StripeConfig | CsvUrlConfig | PostgresConfig;

const MAX_ROWS = 50_000;

export async function fetchConnectorData(config: ConnectorConfig): Promise<ConnectorData> {
  switch (config.kind) {
    case "csv_url":
      return fetchCsvUrl(config);
    case "postgres":
      return fetchPostgres(config);
    case "stripe":
      return fetchStripe(config);
  }
}

function schemaFromRows(headers: string[], rows: Record<string, unknown>[]): SourceColumn[] {
  return headers.map((name) => {
    const sample = rows.find((r) => r[name] !== null && r[name] !== undefined && r[name] !== "");
    const v = sample?.[name];
    let dtype = "string";
    if (typeof v === "number") dtype = "number";
    else if (typeof v === "boolean") dtype = "bool";
    else if (typeof v === "string") dtype = inferDtype(v);
    return { name, dtype };
  });
}

// ── CSV by URL ───────────────────────────────────────────────────────────────
async function fetchCsvUrl(config: CsvUrlConfig): Promise<ConnectorData> {
  const res = await fetch(config.url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`CSV fetch failed: HTTP ${res.status}`);
  const text = await res.text();
  const grid = parseCsv(text);
  if (grid.length === 0) throw new Error("CSV had no rows");
  const hasHeader = config.hasHeader ?? true;
  const headers = hasHeader ? grid[0].map((h, i) => h || `col${i}`) : grid[0].map((_, i) => `col${i}`);
  const body = hasHeader ? grid.slice(1) : grid;
  const rows = body.slice(0, MAX_ROWS).map((r) => {
    const rec: Record<string, unknown> = {};
    headers.forEach((h, i) => (rec[h] = r[i] ?? null));
    return rec;
  });
  return { headers, rows, schema: schemaFromRows(headers, rows) };
}

// ── Postgres ─────────────────────────────────────────────────────────────────
async function fetchPostgres(config: PostgresConfig): Promise<ConnectorData> {
  if (!isReadOnly(config.query)) throw new Error("Postgres connector query must be a read-only SELECT");
  const { Client } = await import("pg");
  const client = new Client({ connectionString: config.connectionString, statement_timeout: 20_000 });
  await client.connect();
  try {
    const result = await client.query(`SELECT * FROM (${config.query}) AS _q LIMIT ${MAX_ROWS}`);
    const headers = result.fields.map((f) => f.name);
    const rows = result.rows.map((r) => {
      const rec: Record<string, unknown> = {};
      for (const h of headers) {
        const v = (r as any)[h];
        rec[h] = v instanceof Date ? v.toISOString().slice(0, 10) : v;
      }
      return rec;
    });
    return { headers, rows, schema: schemaFromRows(headers, rows) };
  } finally {
    await client.end();
  }
}

// ── Stripe (live invoices, or synthetic fallback) ────────────────────────────
async function fetchStripe(config: StripeConfig): Promise<ConnectorData> {
  const key = config.apiKey ?? env.STRIPE_TEST_RESTRICTED_KEY;
  if (!key) return syntheticStripe("No Stripe key — synthetic demo data.");
  try {
    const res = await fetch("https://api.stripe.com/v1/invoices?limit=100&status=paid", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return syntheticStripe(`Stripe API ${res.status} — using synthetic data.`);
    const data = (await res.json()) as any;
    const rows: Record<string, unknown>[] = (data.data ?? []).map((inv: any) => ({
      month: new Date((inv.created ?? 0) * 1000).toISOString().slice(0, 7) + "-01",
      customer: inv.customer_name ?? inv.customer_email ?? inv.customer ?? "unknown",
      plan: inv.lines?.data?.[0]?.price?.nickname ?? "default",
      mrr: (inv.amount_paid ?? 0) / 100,
      currency: inv.currency ?? "usd",
    }));
    if (rows.length === 0) return syntheticStripe("Stripe returned no paid invoices — synthetic data.");
    const headers = Object.keys(rows[0]);
    return { headers, rows, schema: schemaFromRows(headers, rows), note: "live Stripe invoices" };
  } catch {
    return syntheticStripe("Stripe fetch error — using synthetic data.");
  }
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic, realistic Stripe-shaped MRR data so the wedge demo works key-free. */
export function syntheticStripe(note: string): ConnectorData {
  const rand = mulberry32(42);
  const customers = Array.from({ length: 20 }, (_, i) => `Customer ${String.fromCharCode(65 + (i % 26))}${i}`);
  const plans = ["free", "pro", "enterprise"];
  const planMrr: Record<string, number> = { free: 0, pro: 199, enterprise: 999 };
  const regions = ["NA", "EU", "APAC"];
  const headers = ["month", "customer", "plan", "region", "mrr", "churned"];
  const rows: Record<string, unknown>[] = [];

  for (let ci = 0; ci < customers.length; ci++) {
    const plan = plans[Math.floor(rand() * plans.length)];
    const region = regions[Math.floor(rand() * regions.length)];
    const churnMonth = rand() < 0.25 ? 4 + Math.floor(rand() * 8) : 99;
    let mrr = planMrr[plan] * (0.8 + rand() * 0.6);
    for (let m = 0; m < 12; m++) {
      const churned = m >= churnMonth;
      mrr = churned ? 0 : Math.round(mrr * (1 + (rand() - 0.4) * 0.08));
      rows.push({
        month: `2026-${String(m + 1).padStart(2, "0")}-01`,
        customer: customers[ci],
        plan,
        region,
        mrr,
        churned,
      });
    }
  }
  return { headers, rows, schema: schemaFromRows(headers, rows), note };
}

// ── Schema drift ──────────────────────────────────────────────────────────────
export interface Drift {
  added: string[];
  removed: string[];
  retyped: { name: string; from: string; to: string }[];
  changed: boolean;
}

export function detectDrift(prev: SourceColumn[] | null, next: SourceColumn[]): Drift {
  if (!prev) return { added: [], removed: [], retyped: [], changed: false };
  const prevMap = new Map(prev.map((c) => [c.name, c.dtype]));
  const nextMap = new Map(next.map((c) => [c.name, c.dtype]));
  const added = next.filter((c) => !prevMap.has(c.name)).map((c) => c.name);
  const removed = prev.filter((c) => !nextMap.has(c.name)).map((c) => c.name);
  const retyped = next
    .filter((c) => prevMap.has(c.name) && prevMap.get(c.name) !== c.dtype)
    .map((c) => ({ name: c.name, from: prevMap.get(c.name)!, to: c.dtype }));
  return { added, removed, retyped, changed: added.length + removed.length + retyped.length > 0 };
}
