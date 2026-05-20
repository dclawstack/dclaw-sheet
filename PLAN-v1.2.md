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
- [ ] `frontend/package-lock.json` committed after every dependency change
- [ ] `frontend/next-env.d.ts` exists and is committed
- [ ] `docker-compose.yml` healthchecks correct
- [ ] `frontend/Dockerfile` declares `ARG NEXT_PUBLIC_API_URL` before `RUN npm run build`
- [ ] `frontend/public/dclaw-manifest.json` exists (closes PRD Gap #1)

---

## v1.0 Feature Inventory (Current — reality check)

- [ ] Real Workbook / Sheet / Cell models (currently: mock random data in `api/v1/sheet.py`)
- [ ] Real backend CRUD (no mocks)
- [ ] Alembic initial migration committed (`alembic/versions/` is empty)
- [ ] Functional frontend (currently: stub "Server is running" page)
- [ ] DPanel manifest

---

## Roadmap

### Complexity 0 — Foundation (Quick wins)

Goal: replace every mock with a real implementation, get a working end-to-end loop (create workbook → import CSV → edit cells → reload) on local SQLite with the same code path running against Postgres in CI/prod.

| # | Feature | Backend touchpoint | Frontend touchpoint | Acceptance |
|---|---------|--------------------|---------------------|------------|
| 0.1 | **Domain models** Workbook / Sheet / Cell with org-scoping placeholder | `app/models/{workbook,sheet,cell}.py` | — | `Base.metadata` includes 3 tables; FK + cascade rules correct |
| 0.2 | **Local SQLite support** (aiosqlite); `DATABASE_URL` selects engine | `core/config.py`, `core/database.py`, `requirements.txt` | — | `DATABASE_URL=sqlite+aiosqlite:///./dclaw_sheet.db` boots app; Postgres URL still works |
| 0.3 | **Alembic initial migration** (cross-dialect — UUID-as-CHAR(32) on SQLite, native UUID on Postgres) | `alembic/versions/0001_init.py` | — | `alembic upgrade head` succeeds on both dialects |
| 0.4 | **Workbook CRUD** | `repositories/workbook_repo.py`, `schemas/workbook.py`, `api/v1/workbooks.py` | — | POST/GET/LIST/DELETE `/api/v1/workbooks` |
| 0.5 | **Sheet CRUD inside workbook** | `repositories/sheet_repo.py`, `schemas/sheet.py`, `api/v1/sheets.py` | — | POST/LIST/DELETE `/api/v1/workbooks/{id}/sheets` |
| 0.6 | **Cell read/write + bulk** | `repositories/cell_repo.py`, `schemas/cell.py`, `api/v1/cells.py` | — | GET sheet returns cells; PATCH `/sheets/{id}/cells` bulk upsert |
| 0.7 | **CSV import endpoint** | `services/csv_import.py` (stdlib only — no pandas in cmplx-0) | — | POST `/api/v1/workbooks/{id}/import/csv` returns new sheet id |
| 0.8 | **Wire v1 routers**, **delete the mock router** | `api/main.py` | — | `/api/v1/workbooks` resolves; mock random endpoint gone |
| 0.9 | **Frontend: Workbook list page** | — | `app/page.tsx` (replaces stub), `lib/api.ts` typed client | List + create-new modal hits real API |
| 0.10 | **Frontend: Editable grid** (no formulas yet) | — | `app/workbooks/[id]/page.tsx`, `components/sheet-grid.tsx` | Edit cell → PATCH → refresh shows persisted value |
| 0.11 | **DPanel manifest** (PRD Gap #1) | — | `frontend/public/dclaw-manifest.json` | File exists with correct app id/name/color |
| 0.12 | **Branding + metadata** | — | `app/layout.tsx`, `globals.css` | Title "DClaw Sheet"; brand color `#10B981` |
| 0.13 | **Tests** for repos + routers + CSV import | `tests/test_workbooks.py`, `test_sheets.py`, `test_cells.py`, `test_csv_import.py` | — | All green on both SQLite (local) and Postgres (CI) |
| 0.14 | **/health/ready** endpoint (DB ping) | `api/routes/health.py` | — | Returns 200 only when DB is reachable |

**Exit criteria for complexity-0:** `docker compose up -d --build && curl :8020/api/v1/workbooks` returns `[]`; frontend `/` shows the empty workbook list and lets you create one; CSV upload populates a real sheet; all CI tests green.

---

### Complexity 1 — Core Differentiators (the YC demo)

| # | Feature | Notes |
|---|---------|-------|
| 1.1 | **Formula engine v1** | Pure Python: tokenizer, parser (Pratt), evaluator. Cell-ref resolution. ~30 functions (SUM, AVG, MIN, MAX, COUNT, IF, AND, OR, NOT, IFERROR, ROUND, ABS, CONCAT, LEFT, RIGHT, MID, LEN, UPPER, LOWER, TRIM, TODAY, NOW, VLOOKUP, INDEX, MATCH, SUMIF, COUNTIF, AVERAGEIF, ROW, COLUMN). Dependency DAG; incremental recalc. |
| 1.2 | **AI Sheet Copilot endpoint** | `services/ai_copilot.py`. OpenRouter primary, Ollama fallback. Tool-use schema with 4 tools: `write_formula`, `run_sql`, `make_chart`, `propose_clean`. Streamed SSE response. |
| 1.3 | **Frontend Copilot panel** | Floating chat, message thread, "Apply suggestion" button that mutates cells via PATCH. |
| 1.4 | **DuckDB-WASM SQL panel** | Ship `@duckdb/duckdb-wasm` in frontend; load active sheet into in-memory DuckDB table; SQL editor + results grid. |
| 1.5 | **Excel/XLSX import + export** | `openpyxl` server-side. Preserves formulas as values v1; round-trip formulas v1.5. |
| 1.6 | **Chart spec + auto-recommend (Vega-Lite)** | `services/chart_recommend.py` (heuristics: 1 cat + 1 num → bar; 2 num → scatter; time + num → line). Frontend renders via `vega-embed`. |
| 1.7 | **Live connectors v1**: Postgres + CSV-by-URL | `services/connectors/*.py`. Manual refresh in v1.7; scheduled refresh deferred to 2.x. Drift-detection diff in `services/connectors/drift.py`. |
| 1.8 | **CRDT real-time collab (Yjs)** | WebSocket gateway in FastAPI; `y-websocket` server compatible. Per-cell granularity. Live cursors. |
| 1.9 | **Auth (Logto OIDC)** | JWT middleware on `/api/v1/*`. `User`, `Org`, `Workspace` models + scoping on every entity. |
| 1.10 | **Telemetry events** | `events` table: event_type, user_id, workbook_id, ts. Powers retention dashboards. |

**Exit criteria for complexity-1:** Demo flow works end-to-end — a user logs in via Logto, imports XLSX, asks the copilot "Show me MRR by month from the Stripe connector," and gets a chart back in <10s.

---

### Complexity 2 — Advanced / Moat

| # | Feature | Notes |
|---|---------|-------|
| 2.1 | **Agentic workflow runner** | Multi-step plans (≥3 tool calls) with checkpointing. Replans on tool-error. Persists derived sheets. Uses Temporal.io (sacred stack) or a Celery+Redis fallback if Temporal infra unavailable. |
| 2.2 | **Forecasting & anomaly detection** | `statsmodels` SARIMAX for forecasts (12-period horizon, confidence bands). `scikit-learn` IsolationForest for outliers. |
| 2.3 | **Connectors v2** | Stripe, Salesforce, HubSpot, Google Analytics, Snowflake, BigQuery. Scheduled refresh via APScheduler/Temporal. Per-connector schema dictionary feeds copilot RAG. |
| 2.4 | **RAG over data dictionary** | Embeddings via pgvector (sacred stack) of column names + sample values + user-supplied descriptions. Copilot retrieves dictionary fragments before generating SQL. |
| 2.5 | **Templates marketplace + AI customization** | 200+ templates (financial model, runway, cohort retention, SaaS metrics). AI fits template to the user's connector schemas. |
| 2.6 | **Version history & branching** | Append-only `cell_changes` log; `branch_from(workbook_id, at_version)`; 3-way merge for cell-level edits. |
| 2.7 | **Automation engine** | Triggers: cell-change, schedule, webhook. Actions: send email, call HTTP, write back to connector, append to sheet. Visual builder in frontend. |
| 2.8 | **Validation rules + AI rule suggestion** | Type, range, regex, lookup-list, custom-formula. AI infers rules from existing data. |
| 2.9 | **Mobile PWA** | Read-mostly mobile editor; offline-cache via Yjs persistence. |
| 2.10 | **Pivot tables (OLAP)** | Drag-drop dims/measures, backed by DuckDB-WASM GROUP BY. |
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
