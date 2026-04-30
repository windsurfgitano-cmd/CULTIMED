// Aplica supabase/schema.sql a la BD Postgres usando postgres-js.
// Uso: DATABASE_URL=postgres://... node supabase/apply-schema.js

const fs = require("node:fs");
const path = require("node:path");
const postgres = require("postgres");

const PG_URL = process.env.DATABASE_URL;
if (!PG_URL) {
  console.error("✗ DATABASE_URL no definido");
  process.exit(1);
}

const sqlText = fs.readFileSync(path.resolve(__dirname, "schema.sql"), "utf8");

const sql = postgres(PG_URL, { max: 1, ssl: "require", prepare: false });

(async () => {
  try {
    console.log("▶ Aplicando schema...");
    // postgres-js permite multi-statement con .unsafe
    await sql.unsafe(sqlText);
    console.log("✓ Schema aplicado");

    // Verificación rápida: contar tablas
    const tables = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    console.log(`✓ ${tables.length} tablas creadas:`);
    for (const t of tables) console.log(`  · ${t.table_name}`);
  } catch (e) {
    console.error("✗ Error:", e.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
})();
