import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";
import { seedRoadmap } from "./roadmap";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const db = drizzle(neon(url), { schema });
  const n = await seedRoadmap(db);
  console.log(`Seeded ${n} roadmap items.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
