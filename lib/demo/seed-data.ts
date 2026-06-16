/**
 * ─────────────────────────────────────────────────────────────────────────────
 * DEMO SEED — easy to remove.
 * To strip all demo affordances later, delete:
 *   - lib/demo/                        (this folder)
 *   - app/api/demo/                    (seed + clear routes)
 *   - components/demo-controls.tsx     (landing-page controls)
 *   - the <DemoControls/> block in app/page.tsx
 *   - api.seedDemo / api.clearData in lib/client-api.ts
 *   - deleteAllWorkbooks/deleteAllConnections/firstSheetId in lib/queries.ts
 * Nothing else imports this module.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import {
  createWorkbook,
  firstSheetId,
  replaceSheetCells,
  deleteAllWorkbooks,
  deleteAllConnections,
  type CellInput,
} from "@/lib/queries";
import { recordsToCells } from "@/lib/sheet-data";
import { inferDtype } from "@/lib/csv";
import { syntheticStripe } from "@/lib/connectors";

type SeedCell = string | number | { f: string; v: number | string };

/** Build sparse cells from a 2D matrix; objects are formula cells {f: "=...", v: precomputed}. */
function matrixToCells(matrix: SeedCell[][]): CellInput[] {
  const out: CellInput[] = [];
  matrix.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (cell === "" || cell === null || cell === undefined) return;
      if (typeof cell === "object") {
        out.push({ row: r, col: c, raw: cell.f, value: String(cell.v), dtype: typeof cell.v === "number" ? "number" : "string" });
      } else if (typeof cell === "number") {
        out.push({ row: r, col: c, raw: String(cell), value: String(cell), dtype: "number" });
      } else {
        out.push({ row: r, col: c, raw: cell, value: cell, dtype: inferDtype(cell) });
      }
    });
  });
  return out;
}

// A SaaS revenue model showing off the formula engine (Net New + cumulative Total MRR).
const REVENUE_MODEL: SeedCell[][] = [
  ["Month", "New MRR", "Churned MRR", "Net New MRR", "Total MRR"],
  ["2026-01", 5000, 500, { f: "=B2-C2", v: 4500 }, { f: "=D2", v: 4500 }],
  ["2026-02", 6000, 800, { f: "=B3-C3", v: 5200 }, { f: "=E2+D3", v: 9700 }],
  ["2026-03", 7000, 1000, { f: "=B4-C4", v: 6000 }, { f: "=E3+D4", v: 15700 }],
  ["2026-04", 7500, 1200, { f: "=B5-C5", v: 6300 }, { f: "=E4+D5", v: 22000 }],
  ["2026-05", 8200, 1500, { f: "=B6-C6", v: 6700 }, { f: "=E5+D6", v: 28700 }],
  ["2026-06", 9000, 1800, { f: "=B7-C7", v: 7200 }, { f: "=E6+D7", v: 35900 }],
];

// A product catalog showing formulas (Revenue = Price × Units) + pivot-by-category.
const PRODUCT_CATALOG: SeedCell[][] = [
  ["Product", "Category", "Price", "Units", "Revenue"],
  ["Widget A", "Hardware", 49, 120, { f: "=C2*D2", v: 5880 }],
  ["Widget B", "Hardware", 99, 80, { f: "=C3*D3", v: 7920 }],
  ["Pro Plan", "Software", 199, 240, { f: "=C4*D4", v: 47760 }],
  ["Enterprise", "Software", 999, 35, { f: "=C5*D5", v: 34965 }],
  ["Support", "Service", 150, 60, { f: "=C6*D6", v: 9000 }],
];

export interface SeedSummary {
  workbooks: { id: string; name: string; rows: number }[];
  primaryWorkbookId: string | null;
  total: number;
}

/** Reset the workspace to a rich demo state (clears first, then seeds). */
export async function seedDemoData(workspaceId: string): Promise<SeedSummary> {
  await clearAllData(workspaceId);

  const out: SeedSummary = { workbooks: [], primaryWorkbookId: null, total: 0 };

  async function wb(name: string, cells: CellInput[], rows: number) {
    const w = await createWorkbook(workspaceId, name);
    const sid = await firstSheetId(workspaceId, w.id);
    if (sid) await replaceSheetCells(sid, cells);
    out.workbooks.push({ id: w.id, name, rows });
    return w.id;
  }

  // 1) Stripe SaaS metrics — the AI/SQL/pivot/forecast/chart hero dataset.
  const stripe = syntheticStripe("demo seed");
  const primary = await wb("SaaS Metrics — Stripe (demo)", recordsToCells(stripe.headers, stripe.rows), stripe.rows.length);
  out.primaryWorkbookId = primary;

  // 2) Revenue model — formula engine showcase.
  await wb("Revenue Model (demo)", matrixToCells(REVENUE_MODEL), REVENUE_MODEL.length - 1);

  // 3) Product catalog — formulas + pivot.
  await wb("Product Catalog (demo)", matrixToCells(PRODUCT_CATALOG), PRODUCT_CATALOG.length - 1);

  out.total = out.workbooks.length;
  return out;
}

/** Empty the workspace (workbooks + connections) → fresh state. */
export async function clearAllData(workspaceId: string): Promise<{ workbooks: number; connections: number }> {
  const connections = await deleteAllConnections(workspaceId);
  const workbooks = await deleteAllWorkbooks(workspaceId);
  return { workbooks, connections };
}
