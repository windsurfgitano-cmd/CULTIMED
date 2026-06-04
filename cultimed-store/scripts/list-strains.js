// Lista strain_key, sku, name, is_active, shopify_status para auditar catálogo.
require("fs").readFileSync(".env.local", "utf8").split(/\r?\n/).forEach((line) => {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
});
const postgres = require("postgres");
const sql = postgres(process.env.DATABASE_URL, { prepare: false, ssl: "require", max: 1 });

(async () => {
  const all = await sql`
    SELECT id, sku, name, category, presentation, default_price, strain_key,
           is_active, shopify_status, is_house_brand
    FROM products
    ORDER BY COALESCE(strain_key, sku), default_price
  `;
  console.log(`Total: ${all.length} productos\n`);
  console.log("strain_key | id | sku | name | cat | presentation | price | active | shopify | house");
  console.log("-".repeat(140));
  for (const p of all) {
    console.log(`${p.strain_key || "(none)"} | ${p.id} | ${p.sku} | ${p.name} | ${p.category} | ${p.presentation || "-"} | $${p.default_price} | ${p.is_active} | ${p.shopify_status || "-"} | ${p.is_house_brand}`);
  }
  await sql.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
