import {
  pgTable,
  uuid,
  text,
  integer,
  doublePrecision,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const now = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updated = () =>
  timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

// ── Tenancy ──────────────────────────────────────────────────────────────────
export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: now(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name"),
    externalId: text("external_id"), // Clerk/OIDC sub
    createdAt: now(),
  },
  (t) => ({ emailIdx: uniqueIndex("users_email_idx").on(t.email) })
);

// ── Spreadsheet domain ───────────────────────────────────────────────────────
export const workbooks = pgTable(
  "workbooks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => ({ wsIdx: index("workbooks_ws_idx").on(t.workspaceId) })
);

export const sheets = pgTable(
  "sheets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workbookId: uuid("workbook_id")
      .notNull()
      .references(() => workbooks.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
    nRows: integer("n_rows").notNull().default(100),
    nCols: integer("n_cols").notNull().default(26),
    createdAt: now(),
    updatedAt: updated(),
  },
  (t) => ({ wbIdx: index("sheets_wb_idx").on(t.workbookId) })
);

// Sparse cell storage: only non-empty cells are rows.
export const cells = pgTable(
  "cells",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sheetId: uuid("sheet_id")
      .notNull()
      .references(() => sheets.id, { onDelete: "cascade" }),
    row: integer("row").notNull(),
    col: integer("col").notNull(),
    // raw is what the user typed ("=SUM(A1:A3)" or "42" or "hello").
    raw: text("raw"),
    // value is the computed display value (string form).
    value: text("value"),
    // dtype hint for charting / SQL: number | string | bool | date | error
    dtype: text("dtype").notNull().default("string"),
    updatedAt: updated(),
  },
  (t) => ({
    cellCoord: uniqueIndex("cells_coord_idx").on(t.sheetId, t.row, t.col),
    sheetIdx: index("cells_sheet_idx").on(t.sheetId),
  })
);

// ── Connectors ───────────────────────────────────────────────────────────────
export const connections = pgTable(
  "connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").notNull(), // postgres | csv_url | stripe
    // Encrypted JSON config (connection string, url, api key…)
    configEncrypted: text("config_encrypted").notNull(),
    status: text("status").notNull().default("idle"), // idle | syncing | ok | error
    lastError: text("last_error"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: now(),
  },
  (t) => ({ wsIdx: index("connections_ws_idx").on(t.workspaceId) })
);

// ── Data dictionary (RAG over connector/sheet columns) ───────────────────────
export const dictionaryEntries = pgTable(
  "dictionary_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id").references(() => connections.id, {
      onDelete: "cascade",
    }),
    sheetId: uuid("sheet_id").references(() => sheets.id, { onDelete: "cascade" }),
    tableName: text("table_name"),
    columnName: text("column_name").notNull(),
    dtype: text("dtype").notNull().default("string"),
    description: text("description"),
    samples: jsonb("samples").$type<unknown[]>().default([]),
    // pgvector column added via raw migration; kept out of the typed schema until M3.
    createdAt: now(),
  },
  (t) => ({ wsIdx: index("dict_ws_idx").on(t.workspaceId) })
);

// ── Telemetry ────────────────────────────────────────────────────────────────
export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "cascade",
    }),
    eventType: text("event_type").notNull(),
    userId: uuid("user_id"),
    workbookId: uuid("workbook_id"),
    sheetId: uuid("sheet_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}),
    createdAt: now(),
  },
  (t) => ({
    typeIdx: index("events_type_idx").on(t.eventType),
    createdIdx: index("events_created_idx").on(t.createdAt),
  })
);

// ── AI run accounting (token-efficiency ledger for the consensus router) ─────
export const aiRuns = pgTable(
  "ai_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "set null",
    }),
    taskType: text("task_type").notNull(), // copilot | sql_gen | schema_infer | forecast_explain ...
    tier: text("tier").notNull(), // trivial | standard | hard
    models: jsonb("models").$type<string[]>().notNull(),
    chosenModel: text("chosen_model"),
    consensus: jsonb("consensus").$type<Record<string, unknown>>().default({}),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    costUsd: doublePrecision("cost_usd").notNull().default(0),
    latencyMs: integer("latency_ms").notNull().default(0),
    ok: boolean("ok").notNull().default(true),
    createdAt: now(),
  },
  (t) => ({ taskIdx: index("ai_runs_task_idx").on(t.taskType) })
);

// ── Progress tracking (the roadmap lives in the DB, mirrored by ROADMAP.md) ──
export const roadmapItems = pgTable("roadmap_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(), // M0, M1.formula, ...
  milestone: text("milestone").notNull(), // M0..M5
  title: text("title").notNull(),
  gate: text("gate"), // acceptance check
  status: text("status").notNull().default("pending"), // pending | in_progress | done | blocked
  detail: jsonb("detail").$type<Record<string, unknown>>().default({}),
  updatedAt: updated(),
});

export const buildEvents = pgTable(
  "build_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(), // milestone_started | milestone_done | metric | deploy | note
    ref: text("ref"), // e.g. milestone code
    detail: jsonb("detail").$type<Record<string, unknown>>().default({}),
    createdAt: now(),
  },
  (t) => ({ kindIdx: index("build_events_kind_idx").on(t.kind) })
);

export const schema = {
  workspaces,
  users,
  workbooks,
  sheets,
  cells,
  connections,
  dictionaryEntries,
  events,
  aiRuns,
  roadmapItems,
  buildEvents,
};

export const VECTOR_DIM = 1536; // for pgvector dictionary embeddings (M3)
export const _sql = sql;
