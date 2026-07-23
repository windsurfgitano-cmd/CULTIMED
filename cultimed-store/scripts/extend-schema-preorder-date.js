// Agrega products.preorder_available_at (DATE) — fecha estimada en que una cepa
// en reserva (is_preorder=1) queda disponible. Idempotente.
// Correr desde cultimed-store/:  node scripts/extend-schema-preorder-date.js
const fs = require("fs");
const path = require("path");
const postgres = require("postgres");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
if (!url) { console.error("Falta DATABASE_URL en .env.local"); process.exit(1); }

const sql = postgres(url, { prepare: false, ssl: "require", max: 1 });

(async () => {
  try {
    await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS preorder_available_at DATE`;
    const col = await sql`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'products' AND column_name = 'preorder_available_at'`;
    console.log(col.length ? `OK: columna presente (${col[0].data_type})` : "ERROR: no se creo");
  } catch (e) {
    console.error("FALLO:", e.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
})();
