// Lista productos del catálogo para auditar duplicados por cepa.
// Uso: node scripts/list-products.js
// Carga .env.local sin dotenv (zero-deps).
require("fs").readFileSync(".env.local", "utf8").split(/\r?\n/).forEach((line) => {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
});
const postgres = require("postgres");
const sql = postgres(process.env.DATABASE_URL, { prepare: false, ssl: "require", max: 1 });

(async () => {
  const all = await sql`
    SELECT id, sku, name, category, presentation, default_price, vendor,
           thc_percentage, cbd_percentage, is_house_brand, shopify_status
    FROM products
    WHERE is_active = 1
    ORDER BY name, presentation
  `;
  console.log(`Total: ${all.length} productos activos\n`);
  console.log("id | sku | name | cat | presentation | price | vendor | THC/CBD | shopify");
  console.log("-".repeat(120));
  for (const p of all) {
    console.log(`${p.id} | ${p.sku} | ${p.name} | ${p.category} | ${p.presentation || "-"} | $${p.default_price} | ${p.vendor || "-"} | ${p.thc_percentage || "-"}/${p.cbd_percentage || "-"} | ${p.shopify_status}`);
  }

  // Heurística de duplicados: agrupa por nombre normalizado (sin gramaje)
  console.log("\n--- Posibles cepas duplicadas (nombre normalizado quitando gramaje) ---");
  const norm = (n) => n.replace(/\s*[-—·]?\s*\d+\s*g\b/gi, "").replace(/\s+/g, " ").trim().toLowerCase();
  const groups = {};
  for (const p of all) {
    const k = norm(p.name);
    if (!groups[k]) groups[k] = [];
    groups[k].push(p);
  }
  for (const [k, ps] of Object.entries(groups)) {
    if (ps.length > 1) {
      console.log(`\n  "${k}" (${ps.length} variantes):`);
      ps.forEach((p) => console.log(`    - id=${p.id} | ${p.name} | ${p.presentation || ""} | $${p.default_price}`));
    }
  }
  await sql.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
