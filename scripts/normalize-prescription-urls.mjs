#!/usr/bin/env node
/**
 * Normaliza prescription_url legacy: bucket://patient-documents/path → patient-documents://path
 * Uso: node scripts/normalize-prescription-urls.mjs [--apply]
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const APPLY = process.argv.includes("--apply");
const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(path.join(root, "cultimed-store/package.json"));
const postgres = require("postgres");

const envPath = path.join(root, "cultimed-store", ".env.local");
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^DATABASE_URL=(.+)$/);
  if (m) process.env.DATABASE_URL = m[1].replace(/^["']|["']$/g, "");
}

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1 });

function normalizeUrl(stored) {
  const legacy = String(stored).match(
    /^bucket:\/\/(prescriptions|payment-proofs|patient-documents)\/(.+)$/
  );
  if (legacy) return `${legacy[1]}://${legacy[2]}`;
  return null;
}

try {
  const rows = await sql`
    SELECT id, email, prescription_url FROM customer_accounts
    WHERE prescription_url LIKE 'bucket://%'`;
  console.log(`Legacy bucket:// URLs: ${rows.length}`);
  let updated = 0;
  for (const row of rows) {
    const next = normalizeUrl(row.prescription_url);
    if (!next) continue;
    console.log(`  #${row.id} ${row.email}`);
    console.log(`    ${row.prescription_url}`);
    console.log(`    → ${next}`);
    if (APPLY) {
      await sql`
        UPDATE customer_accounts
        SET prescription_url = ${next}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${row.id}`;
      updated++;
    }
  }
  console.log(APPLY ? `\n✅ Updated ${updated}` : `\nDry-run. Use --apply to persist.`);
} finally {
  await sql.end();
}