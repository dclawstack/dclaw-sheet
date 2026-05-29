"use client";

import Link from "next/link";
import {
  Table2,
  Bot,
  Database,
  TrendingUp,
  GitBranch,
  Sparkles,
  Zap,
  ShieldCheck,
  Users,
  Workflow,
  Layers,
  BarChart3,
  ArrowRight,
  CheckCircle2,
  Github,
  Globe,
} from "lucide-react";

import { useAuth } from "@/components/auth-provider";
// DEMO-SEED-CONTROLS — remove this import + the <DemoControls /> usage below
// + frontend/src/components/demo-controls.tsx + frontend/src/lib/demo-seed.ts
// to fully remove the demo seed feature.
import { DemoControls } from "@/components/demo-controls";

function Nav() {
  const { me } = useAuth();
  return (
    <nav className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-gray-100">
      <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-[#10B981] flex items-center justify-center">
            <Table2 className="h-5 w-5 text-white" />
          </div>
          <span className="font-semibold text-gray-900">DClaw Sheet</span>
        </Link>
        <div className="hidden md:flex items-center gap-7 text-sm text-gray-600">
          <a href="#problem" className="hover:text-gray-900">Problem</a>
          <a href="#features" className="hover:text-gray-900">Features</a>
          <a href="#stack" className="hover:text-gray-900">Stack</a>
          <a href="#pricing" className="hover:text-gray-900">Pricing</a>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/app"
            className="rounded-md bg-[#10B981] hover:bg-[#0E9F6E] text-white px-4 py-2 text-sm font-medium flex items-center gap-1.5"
          >
            {me ? "Open app" : "Get started"}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-emerald-50/80 via-white to-white" />
      <div
        className="absolute inset-0 opacity-[0.07] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(#10B981 1px, transparent 1px), linear-gradient(90deg, #10B981 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          maskImage: "radial-gradient(ellipse at center, black 30%, transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-7xl px-6 pt-20 pb-24 lg:pt-28 lg:pb-32">
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 mb-6">
            <Sparkles className="h-3.5 w-3.5" />
            AI Copilot · DuckDB-WASM · CRDT collab · live SaaS connectors
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-gray-900 mb-6">
            The AI spreadsheet for{" "}
            <span className="text-[#10B981]">FP&amp;A &amp; Ops</span> teams.
          </h1>
          <p className="text-lg sm:text-xl text-gray-600 mb-8 leading-relaxed">
            Replace the spreadsheet, the manual ETL, and the lightweight BI tool
            with one AI-driven canvas. Ask in English, get a formula, SQL query,
            chart, or forecast — grounded in your live data.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/app"
              className="rounded-md bg-[#10B981] hover:bg-[#0E9F6E] text-white px-6 py-3 text-base font-medium flex items-center justify-center gap-2 shadow-sm shadow-emerald-500/20"
            >
              Open the app
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="https://github.com/dclawstack/dclaw-sheet"
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 px-6 py-3 text-base font-medium flex items-center justify-center gap-2"
            >
              <Github className="h-4 w-4" />
              View on GitHub
            </a>
          </div>
          <p className="mt-4 text-xs text-gray-500">
            Local-first dev mode · no signup required to demo · runs on SQLite or Postgres
          </p>
        </div>

        {/* DEMO-SEED-CONTROLS — start */}
        <div className="mt-10 mx-auto max-w-3xl">
          <DemoControls />
        </div>
        {/* DEMO-SEED-CONTROLS — end */}

        <div className="mt-12 mx-auto max-w-5xl">
          <SheetMock />
        </div>
      </div>
    </section>
  );
}

function SheetMock() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-xl shadow-emerald-500/5 overflow-hidden">
      <div className="bg-[#10B981] px-5 py-3 flex items-center gap-3">
        <Table2 className="h-4 w-4 text-white" />
        <span className="text-sm text-white font-medium">FY26 Plan</span>
        <span className="flex -space-x-1 ml-2">
          {["A", "M", "K"].map((l, i) => (
            <span
              key={l}
              className="h-5 w-5 rounded-full border border-white/40 text-[10px] flex items-center justify-center text-white font-medium"
              style={{
                backgroundColor: ["#3B82F6", "#F59E0B", "#EC4899"][i],
              }}
            >
              {l}
            </span>
          ))}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3">
        <div className="md:col-span-2 overflow-x-auto border-r border-gray-100">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {["", "month", "revenue", "growth"].map((h) => (
                  <th key={h} className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 border-b border-gray-200">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["1", "2026-01", "120,000", "—"],
                ["2", "2026-02", "132,000", "+10.0%"],
                ["3", "2026-03", "148,000", "+12.1%"],
                ["4", "2026-04", "161,000", "+8.8%"],
                ["5", "2026-05", "178,000", "+10.6%"],
                ["6", "2026-06", "195,000", "+9.6%"],
                ["7", "Sum", "934,000", "=SUM(C2:C7)"],
              ].map((row, i) => (
                <tr key={i} className={i === 6 ? "bg-emerald-50/50 font-medium" : ""}>
                  {row.map((c, j) => (
                    <td key={j} className={`px-3 py-1.5 border-b border-gray-100 ${j === 3 && i < 6 ? "text-emerald-700" : ""} ${j === 3 && i === 6 ? "text-xs font-mono text-gray-500" : ""}`}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-4 bg-gray-50">
          <div className="flex items-center gap-2 mb-3">
            <Bot className="h-4 w-4 text-[#10B981]" />
            <span className="text-sm font-semibold text-gray-900">Copilot</span>
          </div>
          <div className="space-y-2 text-xs">
            <div className="rounded-lg bg-[#10B981] text-white px-3 py-2 ml-6">
              forecast next 6 months
            </div>
            <div className="rounded-lg bg-white border border-gray-200 text-gray-800 px-3 py-2 mr-6">
              I&apos;ll fit SARIMAX and plot the forecast band.
              <div className="mt-1.5 rounded border border-emerald-100 bg-emerald-50 px-2 py-1 font-mono text-[10px] text-emerald-700">
                make_chart(start=B2, end=C7)
              </div>
            </div>
            <div className="rounded-lg bg-[#10B981] text-white px-3 py-2 ml-6">
              add MoM growth column
            </div>
            <div className="rounded-lg bg-white border border-gray-200 text-gray-800 px-3 py-2 mr-6">
              Adding =D2 → (C2-C1)/C1 → applied to D2:D7.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Problem() {
  return (
    <section id="problem" className="py-20 bg-gray-50 border-y border-gray-100">
      <div className="mx-auto max-w-7xl px-6">
        <div className="max-w-3xl mx-auto text-center">
          <span className="text-xs font-semibold tracking-wider text-[#10B981] uppercase">
            The problem
          </span>
          <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-gray-900">
            Your team burns 10–20 hours a week reconciling spreadsheets.
          </h2>
          <p className="mt-5 text-lg text-gray-600">
            FP&amp;A, RevOps, and Ops teams export CSVs from Stripe, Salesforce, HubSpot,
            and the warehouse — paste them into Excel — copy charts into slides — and
            do it all again next month.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              icon: "💸",
              title: "Stale data",
              body: "Numbers are wrong the moment they're exported. Drift between source and sheet causes wrong decisions.",
            },
            {
              icon: "⏱",
              title: "Manual ETL",
              body: "Each CSV export → clean → paste → reformat step is human time. Compounds across 4–6 SaaS sources.",
            },
            {
              icon: "🧩",
              title: "Three tools, one workflow",
              body: "Excel for the model, ETL for refresh, BI for the chart — and a slide deck for the final story.",
            },
          ].map((c) => (
            <div key={c.title} className="rounded-xl bg-white border border-gray-200 p-6">
              <div className="text-3xl mb-2">{c.icon}</div>
              <h3 className="font-semibold text-gray-900">{c.title}</h3>
              <p className="mt-2 text-sm text-gray-600 leading-relaxed">{c.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

interface Feature {
  icon: React.ReactNode;
  title: string;
  body: string;
  badge?: string;
}

const FEATURES: Feature[] = [
  {
    icon: <Bot className="h-5 w-5" />,
    title: "AI Sheet Copilot",
    body: "Tool-using LLM that writes formulas, runs SQL, makes charts, and proposes data cleanups. OpenRouter / Ollama / local stub fallback.",
    badge: "1.2 · 1.3",
  },
  {
    icon: <Database className="h-5 w-5" />,
    title: "DuckDB-WASM SQL",
    body: "Real OLAP-class SQL on the user's sheet — runs in a Web Worker. 10–100× faster than a JS formula engine on large data.",
    badge: "1.4",
  },
  {
    icon: <Layers className="h-5 w-5" />,
    title: "Pivot tables (OLAP)",
    body: "Click-to-assign Rows / Columns / Values with SUM / AVG / COUNT / MIN / MAX. Cross-tab pivots backed by DuckDB GROUP BY.",
    badge: "2.10",
  },
  {
    icon: <BarChart3 className="h-5 w-5" />,
    title: "Chart auto-recommend",
    body: "Column-type inference picks bar / line / point and emits a Vega-Lite v5 spec the frontend renders.",
    badge: "1.6",
  },
  {
    icon: <TrendingUp className="h-5 w-5" />,
    title: "Forecasting & anomaly detection",
    body: "SARIMAX with 80% and 95% confidence bands. IsolationForest on linearly-detrended residuals so growing series flag real spikes.",
    badge: "2.2",
  },
  {
    icon: <Globe className="h-5 w-5" />,
    title: "Live SaaS connectors",
    body: "Postgres, CSV-URL, Stripe, Salesforce, HubSpot, GA, Snowflake, BigQuery. Schema-drift detection on every sync.",
    badge: "1.7 · 2.3",
  },
  {
    icon: <Users className="h-5 w-5" />,
    title: "Real-time collab (CRDT)",
    body: "Yjs WebSocket relay broadcasts awareness state — peer initials in the header, with cell-level CRDT sync on the v1.8.1 path.",
    badge: "1.8",
  },
  {
    icon: <Sparkles className="h-5 w-5" />,
    title: "Formula engine v1",
    body: "Pure-Python tokenizer + Pratt parser + 30 functions. Dependency DAG with incremental recalc — only affected formulas re-run.",
    badge: "1.1",
  },
  {
    icon: <ShieldCheck className="h-5 w-5" />,
    title: "Validation rules",
    body: "Type / range / regex / lookup / formula rules with heuristic AI inference that proposes rules from column data.",
    badge: "2.8",
  },
  {
    icon: <GitBranch className="h-5 w-5" />,
    title: "Version history & branching",
    body: "Append-only cell-change log + branch_from to fork a workbook from any point. Git for spreadsheets.",
    badge: "2.6",
  },
  {
    icon: <Workflow className="h-5 w-5" />,
    title: "Agentic workflow runner",
    body: "Multi-step Plans with checkpointing and retries. Tool registry covers write_cell, write_formula, make_chart, and noop.",
    badge: "2.1",
  },
  {
    icon: <Zap className="h-5 w-5" />,
    title: "Automation engine",
    body: "Trigger → action chains. Actions: emit event, write cell, append row. Manual / cell-change / webhook / schedule triggers.",
    badge: "2.7",
  },
];

function Features() {
  return (
    <section id="features" className="py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="max-w-2xl">
          <span className="text-xs font-semibold tracking-wider text-[#10B981] uppercase">
            What ships
          </span>
          <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-gray-900">
            One canvas. Twelve surfaces.
          </h2>
          <p className="mt-4 text-lg text-gray-600">
            Everything you&apos;d hand-roll across Excel + dbt + Looker + Notion — wired together as a single tool-using AI agent over your workspace.
          </p>
        </div>
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="group rounded-xl bg-white border border-gray-200 p-6 hover:border-emerald-200 hover:shadow-lg hover:shadow-emerald-500/5 transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="h-10 w-10 rounded-lg bg-emerald-50 text-[#10B981] flex items-center justify-center group-hover:bg-emerald-100 transition-colors">
                  {f.icon}
                </div>
                {f.badge && (
                  <span className="text-[10px] font-mono text-gray-400">{f.badge}</span>
                )}
              </div>
              <h3 className="mt-4 font-semibold text-gray-900">{f.title}</h3>
              <p className="mt-2 text-sm text-gray-600 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section className="py-24 bg-gradient-to-b from-white to-emerald-50/30">
      <div className="mx-auto max-w-7xl px-6">
        <div className="max-w-2xl mx-auto text-center">
          <span className="text-xs font-semibold tracking-wider text-[#10B981] uppercase">
            How it works
          </span>
          <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-gray-900">
            From SaaS data to a chart in 30 seconds.
          </h2>
        </div>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            {
              n: "01",
              title: "Connect your sources",
              body: "Pick from Stripe, Salesforce, HubSpot, GA, Snowflake, BigQuery, Postgres, or any CSV URL. We track schema drift on every sync.",
            },
            {
              n: "02",
              title: "Ask in English",
              body: "The AI Copilot parses intent into tool calls: write a formula, run SQL, make a chart, propose a cleanup. Apply with one click.",
            },
            {
              n: "03",
              title: "Forecast, automate, share",
              body: "SARIMAX forecast, IsolationForest anomalies, validation rules, version branches, automation triggers — all on the same sheet.",
            },
          ].map((s) => (
            <div key={s.n} className="relative">
              <span className="font-mono text-5xl font-bold text-[#10B981]/15">{s.n}</span>
              <h3 className="mt-3 text-xl font-semibold text-gray-900">{s.title}</h3>
              <p className="mt-3 text-sm text-gray-600 leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Stack() {
  return (
    <section id="stack" className="py-20 border-t border-gray-100">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center max-w-2xl mx-auto">
          <span className="text-xs font-semibold tracking-wider text-[#10B981] uppercase">
            Tech stack
          </span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-gray-900">
            Built on the modern data stack — not duct-taped to it.
          </h2>
        </div>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-2.5">
          {[
            "Next.js 14",
            "FastAPI",
            "SQLAlchemy 2.0",
            "Pydantic v2",
            "Postgres / SQLite",
            "alembic",
            "DuckDB-WASM",
            "Vega-Lite",
            "Yjs",
            "scikit-learn",
            "statsmodels",
            "openpyxl",
            "Tailwind CSS",
            "Logto OIDC",
            "Helm + K8s",
            "Docker",
          ].map((s) => (
            <span
              key={s}
              className="rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-medium text-gray-700"
            >
              {s}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section id="pricing" className="py-24 bg-gray-50 border-t border-gray-100">
      <div className="mx-auto max-w-7xl px-6">
        <div className="max-w-2xl mx-auto text-center">
          <span className="text-xs font-semibold tracking-wider text-[#10B981] uppercase">
            Pricing
          </span>
          <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-gray-900">
            Seat-based. Add-ons for connectors.
          </h2>
        </div>
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {[
            {
              name: "Local dev",
              price: "Free",
              tagline: "Run it yourself.",
              features: [
                "SQLite or Postgres",
                "Dev-mode auth (no signup)",
                "All features unlocked",
                "Self-hosted on Docker / Helm",
              ],
              cta: "Open the app",
              href: "/app",
            },
            {
              name: "Team",
              price: "$50",
              priceSuffix: "/user/mo",
              tagline: "FP&A and Ops teams.",
              features: [
                "Logto OIDC + workspaces",
                "Multi-tenant RBAC",
                "Real-time collab",
                "Cloud-hosted",
              ],
              cta: "Talk to us",
              href: "mailto:hello@dclawstack.io",
              highlighted: true,
            },
            {
              name: "Connector pack",
              price: "Add-on",
              tagline: "Live SaaS sync.",
              features: [
                "Stripe / Salesforce / HubSpot",
                "GA / Snowflake / BigQuery",
                "Scheduled refresh + drift",
                "Per-connector pricing",
              ],
              cta: "See available connectors",
              href: "/connections",
            },
          ].map((p) => (
            <div
              key={p.name}
              className={`rounded-2xl border p-7 flex flex-col ${
                p.highlighted
                  ? "border-[#10B981] bg-white shadow-xl shadow-emerald-500/10 ring-1 ring-emerald-500/20"
                  : "border-gray-200 bg-white"
              }`}
            >
              <div className="mb-4">
                <h3 className="text-sm font-semibold tracking-wider text-gray-500 uppercase">
                  {p.name}
                </h3>
                <p className="mt-3 flex items-baseline">
                  <span className="text-4xl font-bold text-gray-900">{p.price}</span>
                  {p.priceSuffix && (
                    <span className="ml-1 text-sm text-gray-500">{p.priceSuffix}</span>
                  )}
                </p>
                <p className="mt-1 text-sm text-gray-600">{p.tagline}</p>
              </div>
              <ul className="flex-1 space-y-2 text-sm text-gray-700">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[#10B981] mt-0.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={p.href}
                className={`mt-6 inline-flex items-center justify-center gap-1.5 rounded-md px-4 py-2.5 text-sm font-medium ${
                  p.highlighted
                    ? "bg-[#10B981] text-white hover:bg-[#0E9F6E]"
                    : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {p.cta}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-4xl px-6">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#10B981] to-[#0E9F6E] p-12 text-center">
          <div
            className="absolute inset-0 opacity-20 pointer-events-none"
            style={{
              backgroundImage:
                "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
              backgroundSize: "32px 32px",
              maskImage: "radial-gradient(ellipse at center, black 30%, transparent 70%)",
            }}
          />
          <div className="relative">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
              Replace your spreadsheet, your ETL, and your BI tool.
            </h2>
            <p className="mt-4 text-lg text-emerald-50">
              Local-first dev mode lets you run the whole stack in two commands.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/app"
                className="rounded-md bg-white hover:bg-gray-50 text-[#10B981] px-6 py-3 text-base font-medium flex items-center justify-center gap-2"
              >
                Open the app
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="https://github.com/dclawstack/dclaw-sheet"
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-white/30 bg-transparent hover:bg-white/10 text-white px-6 py-3 text-base font-medium flex items-center justify-center gap-2"
              >
                <Github className="h-4 w-4" />
                Star on GitHub
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-gray-100">
      <div className="mx-auto max-w-7xl px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-md bg-[#10B981] flex items-center justify-center">
            <Table2 className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="font-semibold text-gray-700">DClaw Sheet</span>
          <span>· {new Date().getFullYear()}</span>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/app" className="hover:text-gray-900">App</Link>
          <Link href="/connections" className="hover:text-gray-900">Connections</Link>
          <Link href="/events" className="hover:text-gray-900">Activity</Link>
          <a href="https://github.com/dclawstack/dclaw-sheet" target="_blank" rel="noreferrer" className="hover:text-gray-900">
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}

export default function Landing() {
  return (
    <main className="min-h-screen bg-white text-gray-900">
      <Nav />
      <Hero />
      <Problem />
      <Features />
      <HowItWorks />
      <Stack />
      <Pricing />
      <FinalCta />
      <Footer />
    </main>
  );
}
