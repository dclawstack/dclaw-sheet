# DClaw Sheet — v1.2 Feature Roadmap

> Based on: Y Combinator vertical SaaS principles, trending GitHub repos (luckysheet, univer), AI product research (Rows, Equals, Causal, Layer)

## Pre-Flight Checklist

- [ ] `frontend/package-lock.json` committed after any `npm install` / dependency change
- [ ] `frontend/next-env.d.ts` exists and is committed
- [ ] `docker-compose.yml` healthchecks correct
- [ ] `frontend/Dockerfile` declares `ARG NEXT_PUBLIC_API_URL` before `RUN npm run build`

## v1.0 Feature Inventory (Current)

- [ ] Spreadsheet CRUD
- [ ] Cell editing & formulas
- [ ] Basic formatting
- [ ] Sheet sharing
- [ ] Real backend CRUD (no mocks)
- [ ] Docker + Helm deployment
- [ ] Alembic migrations
- [ ] Backend tests

---

## v1.2 Roadmap

### P0 — Must Have (Ship in v1.0, demo-ready)

#### 1. AI Sheet Copilot (Formula & Analysis Assistant)
**Description:** AI assistant that writes formulas, analyzes data, and suggests insights. "Calculate YoY growth by region and highlight outliers."
- **AI Angle:** Natural language to formula. Data analysis with narrative.
- **Backend:** `/api/v1/ai/sheet-chat` endpoint. Formula generator.
- **Frontend:** Chat panel with formula preview and one-click insert.
- **Files:** `backend/app/services/sheet_ai.py`, `frontend/src/components/sheet-copilot.tsx`

#### 2. Formula Engine & Functions
**Description:** Full formula support: math, logic, text, date, lookup, aggregation, and custom functions.
- **Backend:** Formula parser and execution engine.
- **Frontend:** Formula bar with autocomplete and function help.
- **Files:** `backend/app/services/formula_engine.py`

#### 3. Real-Time Collaboration
**Description:** Multi-user editing with live cursors, cell locking, and comment threads.
- **Backend:** Cell-level sync server.
- **Frontend:** Collaborative grid with user avatars and comment indicators.
- **Files:** `backend/app/services/collaboration.py`

#### 4. Data Import & Export
**Description:** Import CSV, Excel, JSON. Export to multiple formats. Auto-detect data types.
- **Backend:** Import parser with type inference. Export generator.
- **Frontend:** Import wizard with column mapping. Export dialog.
- **Files:** `backend/app/services/import_export.py`

### P1 — Should Have (v1.1–1.2)

#### 5. AI Data Cleaning & Transformation
**Description:** AI suggests and applies data cleaning operations: deduplication, normalization, type correction.
- **AI Angle:** Anomaly detection + cleaning suggestion.
- **Backend:** Data cleaning pipeline.
- **Frontend:** Cleaning suggestions panel with preview.

#### 6. Charts & Visualization
**Description:** Create charts from selected data. Auto-suggest chart types.
- **Backend:** Chart data API.
- **Frontend:** Chart builder with live preview.

#### 7. Database & API Connectivity
**Description:** Connect to databases and APIs. Auto-refresh data.
- **Backend:** Connector framework with query execution.
- **Frontend:** Connection wizard with schema browser.

#### 8. Automation & Macros
**Description:** Record and replay actions. Trigger workflows on cell changes.
- **Backend:** Macro recorder. Trigger engine.
- **Frontend:** Macro editor. Trigger configuration.

### P2 — Could Have (v1.3+)

#### 9. AI Forecasting in Sheets
**Description:** Select data range. AI generates forecasts with confidence intervals.

#### 10. Pivot Tables & OLAP
**Description:** Interactive pivot tables with drag-and-drop dimensions and measures.

#### 11. Version History & Branching
**Description:** Full version history with branching and merge (Git for spreadsheets).

#### 12. Mobile Spreadsheet Editor
**Description**: Optimized mobile experience for viewing and editing on phones.

---

## Implementation Priority

1. **Week 1–2:** AI Sheet Copilot (P0.1) + Formula Engine (P0.2)
2. **Week 3–4:** Collaboration (P0.3) + Import/Export (P0.4)
3. **Week 5–6:** Data Cleaning AI (P1.5) + Charts (P1.6)
4. **Week 7–8:** Database Connectivity (P1.7) + Automation (P1.8)
