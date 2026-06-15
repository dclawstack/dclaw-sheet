# DClaw Sheet

**Ask your data a question in plain English. Get a live spreadsheet + chart back.**

Connect Stripe or Postgres, ask *"what's our net revenue retention by cohort?"*, and DClaw Sheet
writes the SQL (multi-model consensus), runs it in-browser on live data, and hands you a chart —
no exports, no formulas, no BI tool.

## Stack (YC-grade rebuild — v2)

Single Vercel-deployable **Next.js 14** full-stack app.

- **Frontend + API:** Next.js App Router (Route Handlers, server components)
- **Database:** Neon serverless Postgres + Drizzle ORM (pgvector for the data dictionary)
- **Client OLAP:** DuckDB-WASM in the browser (SQL + pivot, 10–100× a JS formula engine on big data)
- **Formulas:** HyperFormula (battle-tested TS engine)
- **AI:** OpenRouter via a **token-efficient consensus router** — cheap models for easy tasks,
  multi-model parallel consensus + arbiter for high-stakes SQL generation. Cost ledger in `ai_runs`.
- **Charts:** Vega-Lite. **Forecast:** dependency-free linear+seasonal with confidence bands +
  robust (MAD) anomaly detection.
- **Deploy:** Vercel with git auto-deploy.

The previous Python FastAPI backend now lives in `legacy/`.

## Run locally

```bash
cp .env.example .env.local      # fill DATABASE_URL + OPENROUTER_API_KEY (see SETUP-KEYS.md)
npm install
npm run db:migrate              # apply schema to Neon (+ pgvector)
npm run db:seed                 # seed the roadmap_items for /admin/progress
npm run dev                     # http://localhost:3000
```

Routes: `/` landing · `/app` workbooks · `/app/[id]` sheet + Copilot/SQL/Pivot/Forecast panels ·
`/admin/progress` build + token-efficiency dashboard.

Zero-key demo: click **Load Stripe demo** on `/app` — synthetic Stripe MRR data so the wedge works
before any external keys, then ask the Copilot *"MRR by month"*.

## Quality gates

```bash
npm run typecheck   # tsc --noEmit
npm run build       # next build
npm run eval        # SQL-generation golden set (needs OPENROUTER_API_KEY), targets >90%
```

## Deploy (Vercel + git auto-deploy)

```bash
vercel link                                   # connect this repo to a Vercel project
vercel env add DATABASE_URL                    # + OPENROUTER_API_KEY, etc.
git push                                        # pushes trigger auto-deploy
```

## Architecture map

```
app/                 # pages + Route Handlers (the API)
  api/               #   workbooks, sheets, cells, ai/{copilot,sql}, connections, demo, sheets/.../forecast
  app/               #   workbook list + sheet workspace
  admin/progress     #   in-DB roadmap + AI cost ledger
components/          # grid, panels (copilot/sql/pivot/forecast), chart-view, ui/
lib/                 # ai/ (consensus router), formula, duckdb, charts, forecast, connectors, queries, …
db/                  # Drizzle schema, client, migrate, seed
evals/               # golden SQL eval set + runner
```
