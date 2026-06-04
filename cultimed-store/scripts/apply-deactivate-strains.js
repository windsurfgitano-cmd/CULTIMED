// Aplica supabase/deactivate-other-strains.sql a la base remota.
// Uso: node scripts/apply-deactivate-strains.js
// Carga .env.local sin dotenv (zero-deps).
require("fs").readFileSync(".env.local", "utf8").split(/\r?\n/).forEach((line) => {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
});
const fs = require("fs");
const path = require("path");
const postgres = require("postgres");

const SQL_PATH = path.join(__dirname, "..", "..", "supabase", "deactivate-other-strains.sql");
const sqlText = fs.readFileSync(SQL_PATH, "utf8");

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  console.error("DATABASE_URL no definido. Carga .env.local en cultimed-store/");
  process.exit(1);
}
const sql = postgres(url, { prepare: false, ssl: "require", max: 1 });

(async () => {
  const before = await sql`
    SELECT strain_key, COUNT(*)::int AS n, SUM(is_active)::int AS active_count
    FROM products GROUP BY strain_key ORDER BY strain_key NULLS LAST
  `;
  console.log("Antes:", before);

  await sql.unsafe(sqlText);
  console.log("Migración aplicada:", SQL_PATH);

  const after = await sql`
    SELECT strain_key, COUNT(*)::int AS n, SUM(is_active)::int AS active_count
    FROM products GROUP BY strain_key ORDER BY strain_key NULLS LAST
  `;
  console.log("Después:", after);

  await sql.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
