import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(path.join(root, "cultimed-store/package.json"));
const postgres = require("postgres");
const envPath = path.join(root, "cultimed-store", ".env.local");
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^DATABASE_URL=(.+)$/);
  if (m) process.env.DATABASE_URL = m[1].replace(/^["']|["']$/g, "");
}

const migrationPath = path.join(root, "supabase", "migration-005-cultisoft-extensions.sql");
const migrationSql = fs.readFileSync(migrationPath, "utf8");

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1 });

try {
  console.log("Applying migration-005...");
  await sql.unsafe(migrationSql);
  console.log("Done.");
} catch (e) {
  console.error("Failed:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}