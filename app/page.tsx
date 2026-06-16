import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DemoControls } from "@/components/demo-controls";
import {
  Sparkles,
  Database,
  FunctionSquare,
  Table2,
  TrendingUp,
  BarChart3,
  FileSpreadsheet,
  Plug,
  Network,
  ShieldCheck,
  ArrowRight,
  MessagesSquare,
  Gauge,
} from "lucide-react";

const FEATURES = [
  {
    icon: Sparkles,
    title: "AI Copilot with tool-use",
    body: "Ask in plain English. The copilot plans, writes SQL, runs it, and charts the result — streaming each step live.",
  },
  {
    icon: Network,
    title: "Token-efficient consensus router",
    body: "Cheap models for easy tasks; a multi-model parallel vote + arbiter for high-stakes SQL. Every run is cost-logged.",
  },
  {
    icon: Database,
    title: "DuckDB-WASM in your browser",
    body: "OLAP-class SQL runs locally on your data — 10–100× a JS engine on big sheets, with zero server round-trips.",
  },
  {
    icon: FunctionSquare,
    title: "Real formula engine",
    body: "30+ functions with incremental dependency recalc (HyperFormula). Edit a cell, dependents update instantly.",
  },
  {
    icon: Table2,
    title: "Pivot tables",
    body: "Drag fields into rows / columns / values with SUM·AVG·COUNT·MIN·MAX. Cross-tabs built on DuckDB on the fly.",
  },
  {
    icon: TrendingUp,
    title: "Forecasting & anomalies",
    body: "Linear + seasonal forecasts with 80/95% confidence bands, plus robust (MAD) outlier detection that beats spikes.",
  },
  {
    icon: Plug,
    title: "Live connectors",
    body: "Stripe, Postgres, and CSV-by-URL with schema-drift detection. Encrypted configs, one-click sync into a sheet.",
  },
  {
    icon: BarChart3,
    title: "Smart charts",
    body: "Vega-Lite charts auto-recommended from your query result — temporal → line, categorical → bar, automatically.",
  },
  {
    icon: FileSpreadsheet,
    title: "Excel in / out",
    body: "Import .xlsx preserving formulas and types; export any sheet back to a clean workbook. CSV too.",
  },
];

const STEPS = [
  { icon: Plug, title: "Connect", body: "Link Stripe or Postgres — or load demo data — in seconds." },
  { icon: MessagesSquare, title: "Ask", body: "Type a question like “MRR by month” in plain English." },
  { icon: BarChart3, title: "Get a chart", body: "The copilot writes the SQL, runs it, and hands you a live chart." },
];

export default function Home() {
  return (
    <main className="flex flex-col">
      {/* Nav */}
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-brand-foreground">◧</span>
            DClaw Sheet
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground sm:flex">
            <a href="#how" className="hover:text-foreground">How it works</a>
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#demo" className="hover:text-foreground">Demo data</a>
            <Link href="/admin/progress" className="hover:text-foreground">Progress</Link>
          </nav>
          <Link href="/app">
            <Button size="sm" className="bg-brand text-brand-foreground hover:bg-brand/90">Open the app</Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-brand/[0.07] via-background to-background" />
        <div className="mx-auto max-w-4xl px-6 py-24 text-center sm:py-32">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-sm font-medium text-brand">
            <Sparkles className="h-3.5 w-3.5" /> AI-native spreadsheet · live data
          </span>
          <h1 className="mt-6 text-balance text-5xl font-bold tracking-tight sm:text-6xl">
            Ask your data a question.
            <br />
            <span className="text-brand">Get a spreadsheet back.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Connect Stripe or Postgres, ask <em>“what’s our net revenue retention by cohort?”</em> in plain
            English, and DClaw Sheet writes the SQL, runs it on live data, and hands you a chart — in
            seconds. No exports, no formulas, no BI tool.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link href="/app">
              <Button size="lg" className="bg-brand text-brand-foreground hover:bg-brand/90">
                Open the app <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <a href="#demo">
              <Button size="lg" variant="outline">Load demo data</Button>
            </a>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-t bg-muted/20">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="text-center text-3xl font-bold">From question to chart in three steps</h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.title} className="relative rounded-2xl border bg-background p-6">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
                  <s.icon className="h-5 w-5" />
                </div>
                <div className="text-xs font-semibold text-brand">STEP {i + 1}</div>
                <h3 className="mt-1 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold">Everything a modern data team needs</h2>
          <p className="mt-3 text-muted-foreground">
            A spreadsheet, a SQL engine, an AI analyst, and a BI tool — in one canvas.
          </p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="group rounded-2xl border p-6 transition hover:border-brand/40 hover:shadow-sm">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10 text-brand transition group-hover:bg-brand group-hover:text-brand-foreground">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Demo data */}
      <section id="demo" className="border-t bg-muted/20">
        <div className="mx-auto max-w-3xl px-6 py-20">
          <div className="mb-6 text-center">
            <h2 className="text-3xl font-bold">Try it with real-shaped data</h2>
            <p className="mt-3 text-muted-foreground">
              Seed a full demo workspace, explore every feature, then clear it whenever you want a clean slate.
            </p>
          </div>
          <DemoControls />
        </div>
      </section>

      {/* Under the hood */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <h2 className="text-center text-3xl font-bold">Under the hood</h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Gauge, t: "Next.js on Vercel", d: "One full-stack app, serverless Route Handlers, git auto-deploy." },
            { icon: Database, t: "Neon Postgres + Drizzle", d: "Serverless Postgres with pgvector for the data dictionary." },
            { icon: Network, t: "OpenRouter consensus", d: "Token-efficient model routing with an auditable cost ledger." },
            { icon: ShieldCheck, t: "Multi-tenant + encrypted", d: "Workspace-scoped data; connector secrets encrypted at rest." },
          ].map((x) => (
            <div key={x.t} className="rounded-2xl border p-6">
              <x.icon className="mb-3 h-5 w-5 text-brand" />
              <h3 className="font-semibold">{x.t}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{x.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground sm:flex-row">
          <span>© DClaw Sheet — the AI spreadsheet that connects to your data.</span>
          <div className="flex gap-5">
            <Link href="/app" className="hover:text-foreground">App</Link>
            <Link href="/admin/progress" className="hover:text-foreground">Build progress</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
