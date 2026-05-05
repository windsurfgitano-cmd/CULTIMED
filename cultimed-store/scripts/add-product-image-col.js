// Agrega columna image_url a products + strain_key (slug normalizado para agrupar variantes).
require("fs").readFileSync(".env.local", "utf8").split(/\r?\n/).forEach((line) => {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
});
const postgres = require("postgres");
const sql = postgres(process.env.DATABASE_URL, { prepare: false, ssl: "require", max: 1 });

(async () => {
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT`;
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS strain_key TEXT`;
  console.log("✓ columns added (image_url, strain_key)");

  // Backfill strain_key. Heurística: nombre sin gramaje, lowercase, slugify
  const all = await sql`SELECT id, name FROM products WHERE is_active = 1`;
  const slugify = (s) =>
    s
      .replace(/\s*[-—·]?\s*\(?\d+\s*(g|ml)\)?\s*$/gi, "")
      .replace(/[(){}\[\]]/g, "")
      .replace(/[^\w\s-]/gi, "")
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase();

  for (const p of all) {
    const key = slugify(p.name);
    await sql`UPDATE products SET strain_key = ${key} WHERE id = ${p.id}`;
    console.log(`  ${p.id} → ${key}`);
  }
  console.log("✓ strain_key backfilled");

  // Index
  await sql`CREATE INDEX IF NOT EXISTS idx_products_strain_key ON products(strain_key)`;
  console.log("✓ idx_products_strain_key created");
  await sql.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
