import { generateSql } from "../lib/ai/sql";
import { aiEnabled } from "../lib/env";
import { GOLDEN, STRIPE_SCHEMA } from "./golden";

async function main() {
  if (!aiEnabled()) {
    console.log("⚠ OPENROUTER_API_KEY not set — add it to .env.local to run the eval (see SETUP-KEYS.md).");
    process.exit(0);
  }

  console.log(`Running ${GOLDEN.length} SQL-generation evals (hard consensus tier)…\n`);
  let pass = 0;
  let cost = 0;
  const failures: string[] = [];

  for (const c of GOLDEN) {
    const r = await generateSql(c.question, STRIPE_SCHEMA);
    cost += r.costUsd;
    const sql = r.sql.toLowerCase();
    const okStructure = r.ok && c.check(sql);
    if (okStructure) {
      pass++;
      console.log(`  ✓ ${c.id}  (agree ${Math.round((r.agreement ?? 0) * 100)}%)`);
    } else {
      failures.push(c.id);
      console.log(`  ✗ ${c.id}  → ${r.ok ? r.sql : r.error}`);
    }
  }

  const pct = Math.round((pass / GOLDEN.length) * 100);
  console.log(`\n${pass}/${GOLDEN.length} passed (${pct}%) · est. cost $${cost.toFixed(4)}`);
  if (failures.length) console.log(`failures: ${failures.join(", ")}`);
  console.log(pct >= 90 ? "\n✅ meets >90% target" : "\n❌ below 90% target");
  process.exit(pct >= 90 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
