// scripts/migrate-gram-pricing.js
//
// Consolida Bourbon Street y Gaslight Purple Ghost de 3 SKUs fijos (5g/10g/20g)
// a 1 SKU por variedad con venta por gramo (columna products.price_tiers).
// Los 6 productos y 6 lotes viejos quedan archivados (is_active=0 / status=depleted),
// NUNCA se borran — preservan el historial de customer_order_items /
// dispensation_items que ya los referencian por product_id.
//
// Uso: node scripts/migrate-gram-pricing.js
// Seguro de re-ejecutar: si el SKU nuevo ya existe, salta esa variedad.

const fs = require("fs");
const path = require("path");
const postgres = require("postgres");

const envPath = path.join(__dirname, "..", ".env.local");
const envText = fs.readFileSync(envPath, "utf8");
const match = envText.match(/^DATABASE_URL=(.*)$/m);
if (!match) throw new Error("DATABASE_URL no encontrado en .env.local");
const DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, "");

const sql = postgres(DATABASE_URL, { ssl: "require", prepare: false });

const VARIETIES = [
  {
    label: "Bourbon Street",
    oldSkus: ["BST-LIT-5G", "BST-LIT-10G", "BST-LIT-20G"],
    newSku: "BST-LIT-GRANEL",
    newName: "Bourbon Street – LIT Farms",
    batchPrefix: "BST-LIT-GRANEL-LOTE",
    tiers: [
      { desde_g: 1, precio_g: 8998 },
      { desde_g: 6, precio_g: 8599 },
      { desde_g: 11, precio_g: 7999.5 },
      { desde_g: 21, precio_g: 7500 },
    ],
  },
  {
    label: "Gaslight Purple Ghost",
    oldSkus: [
      "GASLIGHT-PURPLESATIVA-DOMINANTE-LIT-FARM-5g",
      "GASLIGHT-PURPLESATIVA-DOMINANTE-LIT-FARM-10g",
      "GASLIGHT-PURPLESATIVA-DOMINANTE-LIT-FARM-20g",
    ],
    newSku: "GASLIGHT-PURPLE-GRANEL",
    newName: "Gaslight PURPLE GHOST (Sativa Dominante) – LIT FARM",
    batchPrefix: "GASLIGHT-PURPLE-GRANEL-LOTE",
    tiers: [
      { desde_g: 1, precio_g: 8998 },
      { desde_g: 6, precio_g: 8499 },
      { desde_g: 11, precio_g: 7999.5 },
      { desde_g: 21, precio_g: 7500 },
    ],
  },
];

async function migrateVariety(v) {
  const existing = await sql`SELECT id FROM products WHERE sku = ${v.newSku}`;
  if (existing.length > 0) {
    console.log(`[skip] ${v.label}: ${v.newSku} ya existe (id ${existing[0].id}).`);
    return;
  }

  const oldProducts = await sql`
    SELECT id, sku, name, category, vendor, strain_key, description, image_url,
           is_house_brand, is_preorder, requires_prescription, is_controlled,
           thc_percentage, cbd_percentage
    FROM products WHERE sku IN ${sql(v.oldSkus)}
    ORDER BY default_price ASC
  `;
  if (oldProducts.length !== 3) {
    throw new Error(`${v.label}: esperaba 3 productos viejos, encontre ${oldProducts.length}.`);
  }
  const base = oldProducts[0];
  const oldIds = oldProducts.map((p) => p.id);

  const [batchSummary] = await sql`
    SELECT COALESCE(SUM(quantity_current), 0)::int AS total_g,
           MIN(expiry_date) AS min_expiry,
           MIN(manufacture_date) AS min_manufacture,
           MAX(supplier) AS supplier
    FROM batches WHERE product_id IN ${sql(oldIds)}
  `;
  const { total_g, min_expiry, min_manufacture, supplier } = batchSummary;
  if (total_g <= 0) {
    throw new Error(`${v.label}: stock total en 0g, revisa manualmente antes de migrar.`);
  }

  const notes = `Lote consolidado por migracion venta-por-gramo desde ${v.oldSkus.join(", ")}`;

  await sql.begin(async (tx) => {
    const [newProduct] = await tx`
      INSERT INTO products (
        sku, name, category, presentation, unit, default_price, price_tiers,
        vendor, strain_key, description, image_url,
        is_house_brand, is_preorder, requires_prescription, is_controlled,
        thc_percentage, cbd_percentage, is_active, shopify_status
      ) VALUES (
        ${v.newSku}, ${v.newName}, ${base.category}, 'Flor a granel', 'gramo',
        ${v.tiers[0].precio_g}, ${JSON.stringify(v.tiers)},
        ${base.vendor}, ${base.strain_key}, ${base.description}, ${base.image_url},
        ${base.is_house_brand}, ${base.is_preorder}, ${base.requires_prescription}, ${base.is_controlled},
        ${base.thc_percentage}, ${base.cbd_percentage}, 1, 'active'
      )
      RETURNING id
    `;

    await tx`
      INSERT INTO batches (
        product_id, batch_number, quantity_initial, quantity_current,
        price_per_unit, manufacture_date, expiry_date, supplier, status, notes
      ) VALUES (
        ${newProduct.id}, ${v.batchPrefix + "-" + Date.now()}, ${total_g}, ${total_g},
        ${v.tiers[0].precio_g}, ${min_manufacture}, ${min_expiry}, ${supplier}, 'available', ${notes}
      )
    `;

    await tx`UPDATE products SET is_active = 0, shopify_status = 'archived' WHERE id IN ${tx(oldIds)}`;
    await tx`UPDATE batches SET status = 'depleted' WHERE product_id IN ${tx(oldIds)} AND status = 'available'`;

    console.log(
      `[ok] ${v.label}: creado producto id=${newProduct.id} (${v.newSku}), lote de ${total_g}g. ` +
      `Archivados: ${oldProducts.map((p) => p.sku).join(", ")}.`
    );
  });
}

(async () => {
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS price_tiers jsonb`;
  for (const v of VARIETIES) {
    await migrateVariety(v);
  }
  await sql.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
