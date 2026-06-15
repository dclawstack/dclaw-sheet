import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set — paste the Neon string into .env.local");
  const sql = neon(url);
  const db = drizzle(sql);
  console.log("Running migrations…");
  await migrate(db, { migrationsFolder: "./drizzle" });
  // pgvector extension + embedding column for the data dictionary (M3).
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;
  await sql`ALTER TABLE dictionary_entries ADD COLUMN IF NOT EXISTS embedding vector(1536)`;
  console.log("Migrations complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
