# DClaw Sheet — YC-Grade Rebuild Roadmap

> **Wedge:** Connect a data source → ask a question in English → get a live, refreshing
> spreadsheet + chart back in <10s, no SQL written. One motion. Everything serves it.
>
> **Stack:** Next.js 14 (App Router, full-stack, serverless) · Neon Postgres + Drizzle ORM ·
> DuckDB-WASM (client OLAP) · OpenRouter (consensus model router) · Vercel (git auto-deploy).
>
> Progress is tracked **in the database** (`roadmap_items`, `build_events`, `ai_runs`, `events`)
> and surfaced at `/admin/progress`. This file is the human-readable mirror.

## Architecture decisions (locked)

- **Single deploy unit:** Next.js full-stack on Vercel. Python FastAPI backend retired (legacy/).
- **DB:** Neon serverless Postgres via `@neondatabase/serverless` + Drizzle. pgvector for RAG.
- **AI:** OpenRouter only. A consensus router picks the cheapest model that clears the task's
  quality bar; high-stakes outputs (SQL gen) run a multi-model consensus + cross-check.
- **Formula engine:** HyperFormula (battle-tested TS) — we don't rebuild commodity tech.
- **Auth:** dev-auth fallback (zero-config) + optional Clerk for prod multi-tenant.

## Milestones

| # | Milestone | Status | Gate |
|---|-----------|--------|------|
| M0 | Foundation: Next.js scaffold, Drizzle schema, Neon client, env config, consensus AI module | ⏳ | `npm run build` green; schema migrates |
| M1 | Core loop: Workbook/Sheet/Cell CRUD + editable grid + formula engine + CSV import | ⏳ | create wb → import CSV → edit cell → formula recalcs |
| M2 | Client OLAP: DuckDB-WASM SQL panel + Vega-Lite charts + pivot | ⏳ | run SQL on a sheet, render a chart |
| M3 | AI wedge: copilot tool-use (write_formula/run_sql/make_chart) over consensus router + data dictionary | ⏳ | "MRR by month" → chart, eval set >90% |
| M4 | Connectors: Postgres + CSV-URL + Stripe (synthetic fallback) + lightweight forecast | ⏳ | connect → sync → ask → chart |
| M5 | Deploy: Vercel link, Neon prod branch, env wiring, git auto-deploy, progress dashboard | ⏳ | push to main → live URL updates |

## What we deleted vs the old plan (focus)

Cut/deferred: CRDT collab, automation engine, validation rules, templates marketplace, version
branching, mobile PWA, multi-step agentic runner, 6-connector expansion. They return only after
the wedge demo is undeniable.

## Token-efficiency policy (consensus router)

1. Classify each AI task → tier {trivial, standard, hard}.
2. trivial → one cheap model. standard → one mid model, escalate on low confidence.
3. hard (SQL gen, schema inference) → 2–3 models in parallel, pick consensus answer; if they
   disagree, escalate to a strong arbiter model. Log tokens + $ per run to `ai_runs`.
