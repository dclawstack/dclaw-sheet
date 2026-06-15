import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { roadmapItems, buildEvents } from "./schema";
import { sql } from "drizzle-orm";

const ROADMAP = [
  { code: "M0", milestone: "M0", title: "Foundation: Next.js scaffold, Drizzle/Neon, consensus AI router", gate: "build green; schema migrates", status: "done" },
  { code: "M1", milestone: "M1", title: "Core loop: CRUD + editable grid + formula engine + CSV import", gate: "create wb → import CSV → edit cell → formula recalcs", status: "done" },
  { code: "M2", milestone: "M2", title: "Client OLAP: DuckDB-WASM SQL + Vega-Lite charts + pivot", gate: "run SQL on a sheet, render a chart", status: "done" },
  { code: "M3", milestone: "M3", title: "AI wedge: copilot tool-use over consensus SQL + evals", gate: "MRR by month → chart; eval >90%", status: "done" },
  { code: "M4", milestone: "M4", title: "Connectors (Stripe/Postgres/CSV-URL) + forecast + anomalies", gate: "connect → sync → ask → chart", status: "done" },
  { code: "M5", milestone: "M5", title: "Deploy: Vercel + Neon prod + git auto-deploy + progress dashboard", gate: "push to main → live URL updates", status: "in_progress" },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const db = drizzle(neon(url));

  for (const item of ROADMAP) {
    await db
      .insert(roadmapItems)
      .values(item)
      .onConflictDoUpdate({
        target: roadmapItems.code,
        set: { title: item.title, gate: item.gate, status: item.status, milestone: item.milestone, updatedAt: new Date() },
      });
  }
  await db.insert(buildEvents).values({ kind: "note", ref: "seed", detail: { roadmap: ROADMAP.length } });
  console.log(`Seeded ${ROADMAP.length} roadmap items.`);
  void sql; // keep import
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
