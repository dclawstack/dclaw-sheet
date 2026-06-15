import type { SheetSchema } from "../lib/sheet-data";

/**
 * Golden eval set for SQL generation. Each case checks the generated DuckDB SQL
 * against a synthetic Stripe-shaped schema with structural predicates (read-only,
 * right columns, expected aggregation). Run with `npm run eval` once OPENROUTER_API_KEY
 * is set. Structural checks now; execution-based checks (run SQL vs expected rows)
 * are a tracked follow-up.
 */

export const STRIPE_SCHEMA: SheetSchema = {
  table: "sheet",
  rowCount: 480,
  columns: [
    { name: "month", dtype: "temporal", samples: ["2026-01-01", "2026-02-01", "2026-03-01"] },
    { name: "customer", dtype: "string", samples: ["Acme", "Globex", "Initech"] },
    { name: "plan", dtype: "string", samples: ["free", "pro", "enterprise"] },
    { name: "region", dtype: "string", samples: ["NA", "EU", "APAC"] },
    { name: "mrr", dtype: "number", samples: [49, 199, 999] },
    { name: "churned", dtype: "bool", samples: [false, true] },
  ],
};

export interface GoldenCase {
  id: string;
  question: string;
  check: (sql: string) => boolean;
}

const has = (s: string, ...toks: string[]) => toks.every((t) => s.includes(t));

export const GOLDEN: GoldenCase[] = [
  {
    id: "mrr_by_month",
    question: "Show MRR by month",
    check: (s) => has(s, "month", "mrr") && /group by/.test(s) && /sum\s*\(/.test(s),
  },
  {
    id: "total_revenue",
    question: "What is our total MRR?",
    check: (s) => /sum\s*\(\s*"?mrr/.test(s),
  },
  {
    id: "top5_customers",
    question: "Top 5 customers by MRR",
    check: (s) => has(s, "customer", "mrr") && /order by/.test(s) && /limit\s+5/.test(s),
  },
  {
    id: "avg_mrr_per_plan",
    question: "Average MRR per plan",
    check: (s) => has(s, "plan", "mrr") && /avg\s*\(/.test(s) && /group by/.test(s),
  },
  {
    id: "churned_count",
    question: "How many customers have churned?",
    check: (s) => /churned/.test(s) && /count\s*\(/.test(s),
  },
  {
    id: "pro_monthly_revenue",
    question: "Monthly revenue for the pro plan",
    check: (s) => has(s, "month", "mrr", "pro") && /group by/.test(s),
  },
  {
    id: "mrr_by_region",
    question: "Total MRR by region",
    check: (s) => has(s, "region", "mrr") && /sum\s*\(/.test(s) && /group by/.test(s),
  },
  {
    id: "enterprise_customers",
    question: "List customers on the enterprise plan",
    check: (s) => has(s, "customer", "enterprise"),
  },
];
