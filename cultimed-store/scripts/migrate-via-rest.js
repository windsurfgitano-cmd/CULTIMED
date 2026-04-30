// Migra datos del SQLite local a Supabase Postgres usando @supabase/supabase-js
// (REST API con service_role bypassea RLS y no requiere conexión DB directa).
// Uso:
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate-via-rest.js

const Database = require("better-sqlite3");
const { createClient } = require("@supabase/supabase-js");
const path = require("node:path");
const fs = require("node:fs");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SQLITE_PATH = process.env.SQLITE_PATH ||
  path.resolve(__dirname, "..", "..", "cultisoft", "data", "cultisoft.db");

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("✗ Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!fs.existsSync(SQLITE_PATH)) {
  console.error(`✗ SQLite no encontrado: ${SQLITE_PATH}`);
  process.exit(1);
}

const sqlite = new Database(SQLITE_PATH, { readonly: true });
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// Orden importante: FKs respetadas
const TABLES = [
  "staff",
  "doctors",
  "patients",
  "products",
  "batches",
  "prescriptions",
  "prescription_items",
  "dispensations",
  "dispensation_items",
  "inventory_movements",
  "audit_logs",
  "customer_accounts",
  "customer_orders",
  "customer_order_items",
  "customer_order_events",
  "referral_codes",
  "ambassador_bank_info",
  "referral_conversions",
  "referral_payouts",
  "referral_commissions",
];

const JSON_COLUMNS = {
  audit_logs: ["details"],
};

function normalizeRow(row, table) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === null || v === undefined) {
      out[k] = null;
      continue;
    }
    if (JSON_COLUMNS[table]?.includes(k) && typeof v === "string") {
      try { out[k] = JSON.parse(v); } catch { out[k] = null; }
      continue;
    }
    out[k] = v;
  }
  return out;
}

async function migrateTable(table) {
  const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
  if (rows.length === 0) {
    console.log(`  ${table}: 0 filas, skip`);
    return 0;
  }

  const normalized = rows.map((r) => normalizeRow(r, table));

  const CHUNK = 200;
  let inserted = 0;
  for (let i = 0; i < normalized.length; i += CHUNK) {
    const chunk = normalized.slice(i, i + CHUNK);
    const { error } = await supabase
      .from(table)
      .upsert(chunk, { onConflict: "id" });
    if (error) {
      console.error(`  ✗ ${table} chunk ${i}: ${error.message}`);
      throw error;
    }
    inserted += chunk.length;
    process.stdout.write(`    ${table}: ${inserted}/${normalized.length}\r`);
  }
  console.log(`  ✓ ${table}: ${inserted} filas` + " ".repeat(20));
  return inserted;
}

async function resetSequences() {
  // No se puede vía REST. Lo hacemos al final manualmente o ejecutando un SQL helper.
  // Si el usuario quiere, después correr en SQL Editor:
  //   SELECT setval(pg_get_serial_sequence('TABLE', 'id'), COALESCE(MAX(id),1)) FROM TABLE;
  // para cada tabla.
  console.log("\n⚠ Recordatorio: ejecutar en SQL Editor para resetear secuencias:");
  console.log(`
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  LOOP
    EXECUTE format(
      'SELECT setval(pg_get_serial_sequence(''%I'', ''id''), COALESCE((SELECT MAX(id) FROM %I), 1), true)',
      r.table_name, r.table_name
    );
  END LOOP;
END $$;`);
}

async function main() {
  console.log(`▶ SQLite: ${SQLITE_PATH}`);
  console.log(`▶ Supabase: ${SUPABASE_URL}`);
  console.log("");

  let total = 0;
  for (const table of TABLES) {
    try {
      total += await migrateTable(table);
    } catch (e) {
      console.error(`✗ ${table}: ${e.message}`);
      throw e;
    }
  }

  console.log(`\n✓ Migración completa: ${total} filas en ${TABLES.length} tablas.`);
  await resetSequences();
  sqlite.close();
}

main().catch((e) => {
  console.error("Error fatal:", e);
  process.exit(1);
});
