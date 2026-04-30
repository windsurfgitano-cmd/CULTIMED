// Migra los datos de tu SQLite local (pacientes, productos, recetas, dispensaciones, etc.)
// a tu Postgres Supabase.
//
// Uso:
//   1. Setear DATABASE_URL apuntando a tu Supabase Postgres (con sslmode=require).
//      Ejemplo: postgres://postgres:[PWD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres
//   2. Tener el archivo SQLite local en cultisoft/data/cultisoft.db
//   3. Ejecutar:  node supabase/migrate-data.js
//
// El script:
//   - Lee cada tabla del SQLite
//   - Inserta en Postgres preservando IDs (resetea las secuencias al final)
//   - Es idempotente: si ya hay datos, hace UPSERT por id
//
// Antes de correr este script, aplica `supabase/schema.sql` en el SQL editor de Supabase.

const Database = require("better-sqlite3");
const postgres = require("postgres");
const path = require("node:path");
const fs = require("node:fs");

const SQLITE_PATH = process.env.SQLITE_PATH || path.resolve(__dirname, "..", "..", "cultisoft", "data", "cultisoft.db");
const PG_URL = process.env.DATABASE_URL;

if (!PG_URL) {
  console.error("✗ DATABASE_URL no definido");
  console.error("   Ej: DATABASE_URL='postgres://postgres:[PWD]@db.[ref].supabase.co:5432/postgres' node supabase/migrate-data.js");
  process.exit(1);
}
if (!fs.existsSync(SQLITE_PATH)) {
  console.error(`✗ SQLite no encontrado: ${SQLITE_PATH}`);
  process.exit(1);
}

const sqlite = new Database(SQLITE_PATH, { readonly: true });
const sql = postgres(PG_URL, { max: 5, ssl: "require", prepare: false });

// Orden importante: tablas con FKs después de las que referencian.
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

// Columnas de tipo JSON en Postgres (las parseamos antes de insertar).
const JSON_COLUMNS = {
  audit_logs: ["details"],
};

/** Convierte 0/1 SMALLINT-friendly o pasa el resto tal cual. */
function normalizeValue(value, table, col) {
  if (value === null || value === undefined) return null;
  if (JSON_COLUMNS[table]?.includes(col)) {
    if (typeof value === "string") {
      try { return JSON.parse(value); } catch { return null; }
    }
    return value;
  }
  return value;
}

async function migrateTable(table) {
  const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
  if (rows.length === 0) {
    console.log(`  ${table}: 0 filas, skip`);
    return 0;
  }

  // Detectar columnas
  const cols = Object.keys(rows[0]);

  // Procesamos en chunks de 500 para no exceder límites
  const CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK).map((row) => {
      const obj = {};
      for (const col of cols) {
        obj[col] = normalizeValue(row[col], table, col);
      }
      return obj;
    });

    // INSERT ... ON CONFLICT (id) DO UPDATE SET ... — UPSERT
    // postgres-js permite sql(values) helper para multiple inserts:
    const updateCols = cols.filter((c) => c !== "id");
    const updateClause = updateCols.map((c) => sql`${sql(c)} = EXCLUDED.${sql(c)}`);

    await sql`
      INSERT INTO ${sql(table)} ${sql(chunk, ...cols)}
      ON CONFLICT (id) DO UPDATE SET ${updateClause}
    `;
    inserted += chunk.length;
    process.stdout.write(`    ${table}: ${inserted}/${rows.length}\r`);
  }
  console.log(`  ${table}: ${inserted} filas migradas` + " ".repeat(20));
  return inserted;
}

async function resetSequences() {
  console.log("\n· Reseteando secuencias (BIGSERIAL)…");
  for (const table of TABLES) {
    const seqName = `${table}_id_seq`;
    try {
      await sql.unsafe(`
        SELECT setval('${seqName}',
          GREATEST(COALESCE((SELECT MAX(id) FROM ${table}), 0) + 1, 1),
          false)
      `);
      console.log(`  ${seqName}: ✓`);
    } catch (e) {
      console.log(`  ${seqName}: skip (${e.message})`);
    }
  }
}

async function main() {
  console.log(`▶ SQLite: ${SQLITE_PATH}`);
  console.log(`▶ Postgres: ${PG_URL.replace(/:[^:@]+@/, ":****@")}`);
  console.log("");

  let total = 0;
  for (const table of TABLES) {
    try {
      const n = await migrateTable(table);
      total += n;
    } catch (e) {
      console.error(`✗ ${table}: ${e.message}`);
      throw e;
    }
  }

  await resetSequences();

  console.log(`\n✓ Migración completa: ${total} filas en ${TABLES.length} tablas.`);
  await sql.end();
  sqlite.close();
}

main().catch((e) => {
  console.error("Error fatal:", e);
  process.exit(1);
});
