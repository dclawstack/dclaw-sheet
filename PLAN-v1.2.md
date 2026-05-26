# DClaw Sheet — v1.2 Feature Roadmap & Implementation Plan

> 📘 **REVISED PRD v2.3 available:** See `REVISED-PRD.md` for the original gap analysis, current state, and full feature roadmap.
> This document is the **executable** plan — features are tagged with a complexity number (0/1/2) and ordered for sequential, build-stable execution.

---

## YC-Grade Positioning (the pitch the code must back up)

**Hair-on-fire problem.** FP&A, RevOps, and Ops teams in 50–500-person SaaS companies burn 10–20 hours/week reconciling spreadsheets across SaaS tools (Stripe, Salesforce, HubSpot, Postgres, GA). The status quo is: export CSV → clean in Excel → paste into a model → copy a chart into a slide → repeat next month.

**Wedge.** Replace the spreadsheet **+ the ETL step + the lightweight BI tool** with a single AI-driven canvas. The user asks a question in English; the agent infers schema, writes the pipeline (formula or SQL), executes it against live-connected data, and returns a chart with an explanation. The artifact remains a spreadsheet — familiar to the buyer, but with a SQL/OLAP engine and a tool-using LLM agent behind it.

**Moat (technical sophistication that's hard to copy):**
1. **DuckDB-WASM in the browser** for OLAP-class compute on the user's data — 10–100× faster than a JS formula engine on >10K rows.
2. **CRDT-backed real-time collab** (Yjs) at cell granularity — offline-merge, conflict-free.
3. **Tool-using AI agent** (formula / SQL / chart / connector tools) over a RAG'd data dictionary — multi-step plans, not one-shot completions.
4. **Live SaaS connectors** with schema-drift detection and incremental refresh.
5. **Local-first fallback** — Ollama for compute-air-gapped customers.

**Target persona / pricing.** FP&A & RevOps leads. Seat-based ($50/user/mo) + connector-tier ($X/connector/mo).

---

## Complexity Tagging

- **0 — Foundation / quick wins.** Make the scaffold real: actual DB models, real CRUD, real frontend, no mocks. ~1 week.
- **1 — Core differentiators.** Formula engine, AI copilot, DuckDB-WASM, live connectors, CRDT collab, auth. The YC-demo surface. ~3–4 weeks.
- **2 — Advanced / hard moat.** Agentic workflow runner, forecasting, templates marketplace, version history, automation engine. Where the company defends valuation. ~6–8+ weeks.

---

## Pre-Flight Checklist

- [x] `dclaw_app` → `dclaw_sheet` rename complete
- [x] Ports synced to AGENTS.md (backend 8020 / frontend 3020)
- [x] `frontend/package-lock.json` committed after every dependency change
- [x] `frontend/next-env.d.ts` exists and is committed
- [x] `docker-compose.yml` healthchecks correct (pg_isready / python urllib / wget)
- [x] `frontend/Dockerfile` declares `ARG NEXT_PUBLIC_API_URL` before `RUN npm run build`
- [x] `frontend/public/dclaw-manifest.json` exists (closes PRD Gap #1)

---

## v1.0 Feature Inventory

- [x] Real Workbook / Sheet / Cell models (mock router deleted in cmplx-0)
- [x] Real backend CRUD (no mocks)
- [x] Alembic initial migration committed (`0001_init.py` + `0002_connections.py`)
- [x] Functional frontend (workbook list + editable grid + copilot/SQL/chart panels)
- [x] DPanel manifest

---

## Roadmap

### Complexity 0 — Foundation (Quick wins) — ✅ shipped

Goal: replace every mock with a real implementation, get a working end-to-end loop (create workbook → import CSV → edit cells → reload) on local SQLite with the same code path running against Postgres in CI/prod.

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 0.1 | **Domain models** Workbook / Sheet / Cell | ✅ | `app/models/{workbook,sheet,cell}.py`; `Connection` added in 1.7 |
| 0.2 | **Local SQLite support** (aiosqlite) | ✅ | Default `DATABASE_URL` sqlite; Postgres URL works in CI |
| 0.3 | **Alembic initial migration** | ✅ | `0001_init.py` (+ `0002_connections.py` for 1.7) |
| 0.4 | **Workbook CRUD** | ✅ | POST/GET/PATCH/DELETE `/api/v1/workbooks` |
| 0.5 | **Sheet CRUD inside workbook** | ✅ | POST/GET/PATCH/DELETE `/api/v1/sheets` |
| 0.6 | **Cell read/write + bulk** | ✅ | PUT single + PATCH bulk + DELETE clear |
| 0.7 | **CSV import endpoint** | ✅ | `services/csv_import.py` stdlib only |
| 0.8 | **Wire v1 routers**, **delete the mock router** | ✅ | Mock random endpoint gone |
| 0.9 | **Frontend: Workbook list page** | ✅ | List + create modal + delete |
| 0.10 | **Frontend: Editable grid** | ✅ | Double-click edit; Enter to save; formula support in 1.1 |
| 0.11 | **DPanel manifest** (PRD Gap #1) | ✅ | `frontend/public/dclaw-manifest.json` |
| 0.12 | **Branding + metadata** | ✅ | Title "DClaw Sheet", `#10B981` brand color |
| 0.13 | **Tests** for repos + routers + CSV import | ✅ | 18 tests, all green on SQLite + Postgres |
| 0.14 | **/health/ready** endpoint (DB ping) | ✅ | `SELECT 1` against the bound session |

**Exit criteria for complexity-0:** `docker compose up -d --build && curl :8020/api/v1/workbooks` returns `[]`; frontend `/` shows the empty workbook list and lets you create one; CSV upload populates a real sheet; all CI tests green.

---

### Complexity 1 — Core Differentiators (the YC demo)

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1.1 | **Formula engine v1** | ✅ | Tokenizer + Pratt parser + evaluator; 30+ fns incl. SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, ROUND, ABS, INT, MOD, POWER, SQRT, IF (short-circuit), AND, OR, NOT, IFERROR (lazy), CONCAT, LEFT, RIGHT, MID, LEN, UPPER, LOWER, TRIM, TODAY, NOW, SUMIF, COUNTIF, AVERAGEIF, VLOOKUP, MATCH, INDEX, ROW, COLUMN. **Incremental** dependency-DAG recalc via `recalc_after_changes()` — only formulas whose closure intersects changed coords are re-evaluated. Cycles flagged `#CIRC!`. |
| 1.2 | **AI Sheet Copilot endpoint** | ✅ | `services/ai_copilot.py` provider chain (OpenRouter → Ollama → deterministic stub). Tool-use schema: `write_formula`, `run_sql`, `make_chart`, `propose_clean`. JSON envelope at `/api/v1/ai/sheets/{id}/copilot`; **SSE streaming** at `/copilot/stream` (`message` → `tool_call`* → `done`). |
| 1.3 | **Frontend Copilot panel** | ✅ | Chat thread, tool-call cards, "Apply" button calls `upsertCell` for `write_formula` and opens the chart panel for `make_chart`. |
| 1.4 | **DuckDB-WASM SQL panel** | ✅ | `@duckdb/duckdb-wasm` in a Web Worker; loads the active sheet via `read_json_auto`; SQL editor + paged results grid. |
| 1.5 | **Excel/XLSX import + export** | ✅ | Server-side `openpyxl`. Import preserves formulas; export emits values + formulas. |
| 1.6 | **Chart spec + auto-recommend (Vega-Lite)** | ✅ | `services/charts.py` infers column types (quant/temporal/nominal) → bar/line/point. Frontend renders via `vega-embed` (canvas marked as a webpack fallback). |
| 1.7 | **Live connectors v1**: Postgres + CSV-by-URL | ✅ | `services/connectors/{base,csv_url,postgres,drift}.py`. Fernet-encrypted configs. Manual refresh; scheduled deferred to 2.3. Drift report (added/removed/reordered) returned on every sync. |
| 1.8 | **CRDT real-time collab (Yjs)** | ⏭ deferred | Pulls infra weight (WebSocket gateway + persistence); scheduled for after 1.9 per Sprint-1 ordering. |
| 1.9 | **Auth (Logto OIDC)** | ✅ | `Org`/`Workspace`/`User`/`Membership` models + 0004_auth migration (seeds & backfills a default workspace). `get_current_workspace` FastAPI dep with two providers: `dev` (auto-grants every request a default user — zero-config local) and `logto` (RS256 JWT verified against `LOGTO_JWKS_URL`; user upserted from `sub`/`email` claims). Workspace scoping on workbooks / sheets / cells / connections / events / copilot / charts — every list returns only the caller's workspace; foreign IDs return 404. `GET /api/v1/me` exposes user + workspace + provider. Frontend `AuthProvider` + `AuthGate` show a token-paste login screen when the API returns 401; user/workspace badge in the home header. |
| 1.10 | **Telemetry events** | ✅ | `events` table (event_type / user_id / workbook_id / sheet_id / JSON payload / created_at) + `services/telemetry.emit()` fire-and-forget. Emitting on workbook.created/deleted, sheet.created, csv.imported, xlsx.imported, sheet.exported, chart.requested, copilot.asked, connection.{created,synced,refreshed}. `GET /api/v1/events` + `/events/summary` (total / today / daily counts / daily-active-workbooks / by-type). Frontend `/events` retention dashboard with Vega-Lite bar charts. |

**Exit criteria for complexity-1:** Demo flow works end-to-end — a user logs in via Logto, imports XLSX, asks the copilot "Show me MRR by month from the Stripe connector," and gets a chart back in <10s.

**Current state:** 9/10 shipped. The exit-criteria demo loop is reachable end-to-end: sign in (Logto in prod, auto-granted in dev) → import XLSX → ask the copilot → get a chart back. Only **1.8 CRDT collab** remains in Sprint 1.

---

### Complexity 2 — Advanced / Moat

| # | Feature | Notes |
|---|---------|-------|
| 2.1 | **Agentic workflow runner** | Multi-step plans (≥3 tool calls) with checkpointing. Replans on tool-error. Persists derived sheets. Uses Temporal.io (sacred stack) or a Celery+Redis fallback if Temporal infra unavailable. |
| 2.2 | **Forecasting & anomaly detection** ✅ | `services/forecasting.py`: SARIMAX with heuristic-picked order (1,0,0)/(1,1,0)/(1,1,1) by series length, returns 80% + 95% confidence bands. IsolationForest with **linear detrending** before fit so growing/shrinking series flag real spikes, not endpoints. API `POST /sheets/{id}/forecast` + `/anomalies`. Frontend `ForecastPanel` with column picker, periods slider, layered Vega-Lite chart (history line + forecast line + 80/95% bands) + outlier table. |
| 2.3 | **Connectors v2** | Stripe, Salesforce, HubSpot, Google Analytics, Snowflake, BigQuery. Scheduled refresh via APScheduler/Temporal. Per-connector schema dictionary feeds copilot RAG. |
| 2.4 | **RAG over data dictionary** | Embeddings via pgvector (sacred stack) of column names + sample values + user-supplied descriptions. Copilot retrieves dictionary fragments before generating SQL. |
| 2.5 | **Templates marketplace + AI customization** | 200+ templates (financial model, runway, cohort retention, SaaS metrics). AI fits template to the user's connector schemas. |
| 2.6 | **Version history & branching** | Append-only `cell_changes` log; `branch_from(workbook_id, at_version)`; 3-way merge for cell-level edits. |
| 2.7 | **Automation engine** | Triggers: cell-change, schedule, webhook. Actions: send email, call HTTP, write back to connector, append to sheet. Visual builder in frontend. |
| 2.8 | **Validation rules + AI rule suggestion** | Type, range, regex, lookup-list, custom-formula. AI infers rules from existing data. |
| 2.9 | **Mobile PWA** | Read-mostly mobile editor; offline-cache via Yjs persistence. |
| 2.10 | **Pivot tables (OLAP)** ✅ | `PivotPanel`: click-to-assign fields to Rows / Columns (cross-tab) / Values, per-measure aggregator (SUM / AVG / COUNT / MIN / MAX). SQL built on the fly with `GROUP BY` against the in-browser DuckDB table; cross-tab pivots a single measure across unique column-dim values client-side. Shared `lib/duckdb.ts` so the SQL panel (1.4) and the pivot panel reuse the same sheet-to-DuckDB pipeline. |
| 2.11 | **Audit log + permissions** | Cell-level read/write ACL; immutable audit trail. |

**Exit criteria for complexity-2:** A new customer can connect Stripe + Salesforce, ask "build me a runway model with our actual data," and get back a fully populated, ongoingly-refreshed forecast workbook — no human SQL written.

---

## Sequenced Implementation Order (the build queue)

This is the order the autonomous loop will execute. Each row must leave the build green (CI on Postgres + local SQLite) before advancing.

### Sprint 0 (Foundation — Complexity 0)

1. 0.1 + 0.2 + 0.3 — Models, SQLite support, initial migration
2. 0.4 → 0.5 → 0.6 — CRUD chains (workbook → sheet → cells)
3. 0.7 + 0.8 — CSV import, wire routers, kill mock router
4. 0.13 + 0.14 — Backend tests + readiness endpoint
5. 0.9 + 0.10 + 0.11 + 0.12 — Frontend list page, grid, manifest, branding

### Sprint 1 (Differentiators — Complexity 1)

6. 1.1 Formula engine → 1.5 XLSX → 1.6 charts → 1.2/1.3 AI copilot end-to-end
7. 1.4 DuckDB-WASM → 1.7 live connectors → 1.10 telemetry
8. 1.9 auth & multi-tenancy
9. 1.8 CRDT collab (last because it adds infra weight)

### Sprint 2 (Moat — Complexity 2)

10. 2.4 RAG dictionary → 2.1 agentic workflow → 2.3 connector expansion
11. 2.2 forecasting → 2.5 templates
12. 2.6 versioning → 2.7 automation → 2.8 validation
13. 2.9 mobile, 2.10 pivots, 2.11 audit/ACL

---

## Local Dev / Database Setup

- Default `DATABASE_URL` (no env): `sqlite+aiosqlite:///./dclaw_sheet.db` — zero-config local dev.
- Recommended for parity with prod: `postgresql+asyncpg://postgres:postgres@localhost:5432/dclaw_sheet` (matches `docker-compose.yml`).
- Schema is dialect-portable for complexity 0–1: UUID via `sqlalchemy.Uuid(as_uuid=True)` (CHAR(32) on SQLite, native UUID on Postgres); no Postgres-only types yet. pgvector (2.4) and JSONB-heavy queries land in complexity 2 and gate on Postgres.
- CI continues to use the Postgres service in `ci.yml` — both dialects must pass the test suite.

---

## Out of Scope (intentionally not in this plan)

- Cell-level styling beyond text/number/bool/date (complexity 1.x can revisit if FP&A demo needs it)
- Mobile apps beyond PWA
- Self-hosted enterprise — comes after the YC milestone
- Marketplace monetization mechanics (post-YC)
