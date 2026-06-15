// DEMO-SEED — self-contained demo data seeder/clearer.
// To remove this feature entirely:
//   1. delete this file
//   2. delete frontend/src/components/demo-controls.tsx
//   3. remove the DEMO-SEED-CONTROLS block in frontend/src/app/page.tsx
//
// All seed data flows through existing /api/v1 endpoints, so nothing else
// in the app depends on this module.

import {
  createConnection,
  createWorkbook,
  deleteConnection,
  deleteWorkbook,
  listConnections,
  listWorkbooks,
  type Sheet,
  type Workbook,
} from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
const TOKEN_KEY = "dclaw_sheet_auth_token";

function authHeader(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = window.localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeader(),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`${init?.method ?? "GET"} ${path} → ${res.status} ${await res.text()}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

async function applyTemplate(workbookId: string, templateId: string): Promise<Sheet[]> {
  return api<Sheet[]>(`/api/v1/templates/apply/${workbookId}`, {
    method: "POST",
    body: JSON.stringify({ template_id: templateId }),
  });
}

async function addValidationRule(
  sheetId: string,
  column: number,
  rule_type: "type" | "range" | "regex" | "lookup" | "formula",
  params: Record<string, unknown>,
  message?: string,
): Promise<void> {
  await api(`/api/v1/validation/sheets/${sheetId}/rules`, {
    method: "POST",
    body: JSON.stringify({ column, rule_type, params, message: message ?? null }),
  });
}

export interface DemoSeedReport {
  workbooks_created: number;
  sheets_created: number;
  connections_created: number;
  validation_rules_created: number;
}

const DEMO_WORKBOOKS: { name: string; description: string; templates: string[] }[] = [
  {
    name: "FY26 Plan (demo)",
    description: "SaaS metrics, runway projection, and 3-year P&L.",
    templates: ["saas_metrics", "runway", "financial_model"],
  },
  {
    name: "Revenue Ops (demo)",
    description: "Sales pipeline and cohort retention.",
    templates: ["sales_pipeline", "cohort_retention"],
  },
  {
    name: "Scratch Workbook (demo)",
    description: "Empty workbook for ad-hoc Copilot prompts.",
    templates: [],
  },
];

export async function seedDemoData(): Promise<DemoSeedReport> {
  const report: DemoSeedReport = {
    workbooks_created: 0,
    sheets_created: 0,
    connections_created: 0,
    validation_rules_created: 0,
  };

  for (const spec of DEMO_WORKBOOKS) {
    const wb = await createWorkbook(spec.name, spec.description);
    report.workbooks_created += 1;
    for (const tplId of spec.templates) {
      const sheets = await applyTemplate(wb.id, tplId);
      report.sheets_created += sheets.length;

      // Demonstrate validation rules on the first sheet of the SaaS metrics
      // template (column 1 = revenue should be a positive number).
      if (tplId === "saas_metrics" && sheets[0]) {
        try {
          await addValidationRule(
            sheets[0].id,
            1,
            "type",
            { type: "number" },
            "revenue must be numeric",
          );
          await addValidationRule(
            sheets[0].id,
            1,
            "range",
            { min: 0 },
            "revenue must be non-negative",
          );
          report.validation_rules_created += 2;
        } catch {
          // Validation rules are nice-to-have for the demo — don't fail seed.
        }
      }
    }
  }

  try {
    await createConnection({
      name: "Sample CSV — public dataset (demo)",
      type: "csv_url",
      config: {
        url: "https://raw.githubusercontent.com/datasciencedojo/datasets/master/titanic.csv",
      },
    });
    report.connections_created += 1;
  } catch {
    // Connection creation is best-effort for the demo.
  }

  return report;
}

export interface DemoClearReport {
  workbooks_deleted: number;
  connections_deleted: number;
}

export async function clearDemoData(): Promise<DemoClearReport> {
  const report: DemoClearReport = {
    workbooks_deleted: 0,
    connections_deleted: 0,
  };

  // Delete everything in the workspace — the landing-page button copy makes
  // it explicit that this wipes ALL data, not just demo-seeded rows.
  let page = 0;
  while (true) {
    const list = await listWorkbooks(100, page * 100);
    if (list.items.length === 0) break;
    for (const wb of list.items as Workbook[]) {
      await deleteWorkbook(wb.id);
      report.workbooks_deleted += 1;
    }
    if (list.items.length < 100) break;
    page += 1;
  }

  const connections = await listConnections();
  for (const c of connections) {
    await deleteConnection(c.id);
    report.connections_deleted += 1;
  }

  return report;
}
