// Carga el drop de agosto 2026:
//  - 4 cepas nuevas en RESERVA (is_preorder=1) disponibles desde 2026-08-01,
//    con 100g de lote pre-cargado y la escalera de precios estandar por gramo.
//  - Cream Caramel pasa a COMPRA INMEDIATA (is_preorder=0) con 100g y precio.
//  - Aplica las fotos de "ingredientes del olor" a las 11 cepas del catalogo.
// Idempotente: correr dos veces no duplica productos ni apila stock.
// Correr desde cultimed-store/:  node scripts/seed-reserva-agosto.js
const fs = require("fs");
const path = require("path");
const postgres = require("postgres");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
if (!url) { console.error("Falta DATABASE_URL"); process.exit(1); }
const sql = postgres(url, { prepare: false, ssl: "require", max: 1 });

// URLs publicas de las fotos ya subidas a Supabase Storage.
const IMG = JSON.parse(fs.readFileSync(
  "C:/Users/OZYMAN~1/AppData/Local/Temp/claude/C--Users-Ozymandias-Documents-CultiSoft/fda13b0e-a645-497a-aeb3-326a60f1a5a9/scratchpad/img-urls.json", "utf8"));

// Escalera de precios por gramo estandar (misma que Bourbon/Gaslight).
const LADDER = [
  { desde_g: 1, precio_g: 8998 },
  { desde_g: 6, precio_g: 8599 },
  { desde_g: 11, precio_g: 7999.5 },
  { desde_g: 21, precio_g: 7500 },
];
const BASE_PRICE = 8998;         // default_price y price_per_unit del lote
const STOCK_G = 100;             // 100g por cepa, como pidio Oscar
const AVAILABLE_FROM = "2026-08-01";
const MANUF = "2026-07-23";
const EXPIRY = "2027-07-23";     // ~12 meses

// Las 4 cepas nuevas (flor; Fast Buds es el criador, NO son semillas).
const NEW_STRAINS = [
  {
    sku: "banana-purple-punch-auto",
    name: "Banana Purple Punch Auto",
    vendor: "Fast Buds",
    thc: 22, cbd: 1,
    desc: "Autofloreciente de Fast Buds, cruce de Purple Punch Auto x Strawberry Banana Auto. Hibrido de dominancia indica (aprox. 75% indica / 25% sativa). El criador informa un THC de 22-26% (hasta 30% en fenotipos selectos) y CBD <1%. Ciclo de alrededor de 70 dias de semilla a cosecha; rendimiento interior de 450-550 g/m2 y exterior de 60-200 g por planta. Perfil aromatico: explosion frutal de platano maduro, fresa y uva morada, con bayas, un fondo tropical de pina y el caracteristico toque petrol de la familia Purple Punch. Efectos: relajacion profunda de dominancia indica, euforia suave y alivio corporal.",
  },
  {
    sku: "wedding-cheesecake",
    name: "Wedding Cheesecake",
    vendor: "Fast Buds",
    thc: 24, cbd: 1,
    desc: "Autofloreciente de Fast Buds de altisima potencia, con un 24% de THC y CBD <1%. Desarrolla cogollos grandes y muy resinosos; puede rendir hasta 600 g/m2 en alrededor de 70 dias. Perfil aromatico cremoso y dulce tipo tarta de queso, con vainilla y un fondo terroso y quesero. Efecto potente y prolongado, recomendado para pacientes con tolerancia alta.",
  },
  {
    sku: "lemon-pie",
    name: "Lemon Pie",
    vendor: "Fast Buds",
    thc: 24, cbd: 1,
    desc: "Autofloreciente de Fast Buds, agridulce y extremadamente potente (24% de THC, CBD <1%). De floracion rapida: produce hasta 550 g/m2 de flores muy resinosas en 56-63 dias. Perfil aromatico de limon exuberante, citrico intenso y un fondo dulce que redondea una experiencia agridulce. Efecto vigoroso y equilibrado.",
  },
  {
    sku: "zkittlez",
    name: "Zkittlez",
    vendor: "Fast Buds",
    thc: 22, cbd: 1,
    desc: "Autofloreciente de Fast Buds considerada un referente de calidad en genetica autofloreciente. THC cercano al 22% y CBD <1%. Crece hasta alrededor de 100 cm y rinde unos 500 g/m2 en cerca de 70 dias. Perfil aromatico de caramelo dulce y un arco iris de frutas: bayas dulces y notas afrutadas intensas. Efecto relajante y placentero.",
  },
];

async function upsertBatch(tx, productId, sku, supplier) {
  const bn = `${sku.toUpperCase()}-RESERVA-100G`;
  // Idempotencia: borra nuestro lote determinista antes de recrearlo (no apila).
  await tx.unsafe(`DELETE FROM batches WHERE product_id = $1 AND batch_number = $2`, [productId, bn]);
  await tx.unsafe(
    `INSERT INTO batches
       (product_id, batch_number, quantity_initial, quantity_current, price_per_unit,
        manufacture_date, expiry_date, supplier, status, notes)
     VALUES ($1,$2,$3,$3,$4,$5,$6,$7,'available',$8)`,
    [productId, bn, STOCK_G, BASE_PRICE, MANUF, EXPIRY, supplier,
     "Lote pre-cargado para el drop de agosto 2026"]);
  return bn;
}

(async () => {
  try {
    await sql.begin(async (tx) => {
      // 1) Cepas nuevas en reserva
      for (const s of NEW_STRAINS) {
        const rows = await tx.unsafe(
          `INSERT INTO products
             (sku, name, category, presentation, unit, requires_prescription, is_controlled,
              default_price, price_tiers, description, vendor, is_house_brand,
              is_preorder, preorder_available_at, shopify_status, is_active, image_url, strain_key)
           VALUES ($1,$2,'flores','Flor a granel','gramo',1,0,
              $3,$4::jsonb,$5,$6,0,
              1,$7,'active',1,$8,$1)
           ON CONFLICT (sku) DO UPDATE SET
             name=EXCLUDED.name, category=EXCLUDED.category, presentation=EXCLUDED.presentation,
             unit=EXCLUDED.unit, default_price=EXCLUDED.default_price, price_tiers=EXCLUDED.price_tiers,
             description=EXCLUDED.description, vendor=EXCLUDED.vendor, is_preorder=1,
             preorder_available_at=EXCLUDED.preorder_available_at, shopify_status='active',
             is_active=1, image_url=EXCLUDED.image_url, strain_key=EXCLUDED.strain_key,
             thc_percentage=EXCLUDED.thc_percentage, cbd_percentage=EXCLUDED.cbd_percentage,
             updated_at=now()
           RETURNING id`,
          [s.sku, s.name, BASE_PRICE, JSON.stringify(LADDER), s.desc, s.vendor,
           AVAILABLE_FROM, IMG[s.sku]]);
        // thc/cbd (columnas separadas, las seteo aparte para no ensuciar el INSERT)
        await tx.unsafe(`UPDATE products SET thc_percentage=$2, cbd_percentage=$3 WHERE id=$1`,
          [rows[0].id, s.thc, s.cbd]);
        const bn = await upsertBatch(tx, rows[0].id, s.sku, s.vendor);
        console.log(`RESERVA  ${s.name}  (id=${rows[0].id}, lote ${bn}, ${STOCK_G}g)`);
      }

      // 2) Cream Caramel -> compra inmediata
      const cc = await tx.unsafe(
        `UPDATE products SET
           is_preorder=0, preorder_available_at=NULL,
           default_price=$1, price_tiers=$2::jsonb,
           image_url=$3, updated_at=now()
         WHERE sku='cream-caramel-f1-fast-version'
         RETURNING id, name`,
        [BASE_PRICE, JSON.stringify(LADDER), IMG["cream-caramel-f1-fast-version"]]);
      if (!cc.length) throw new Error("No encontre Cream Caramel");
      const bnCC = await upsertBatch(tx, cc[0].id, "cream-caramel-f1-fast-version", "Sweet Seeds");
      console.log(`COMPRA   ${cc[0].name}  (id=${cc[0].id}, lote ${bnCC}, ${STOCK_G}g)`);

      // 3) Fotos de ingredientes en TODAS las variantes de cada cepa (por strain_key)
      let n = 0;
      for (const [key, imgUrl] of Object.entries(IMG)) {
        const r = await tx.unsafe(
          `UPDATE products SET image_url=$2, updated_at=now() WHERE strain_key=$1 RETURNING sku`,
          [key, imgUrl]);
        n += r.length;
      }
      console.log(`FOTOS    aplicadas a ${n} SKUs (${Object.keys(IMG).length} cepas)`);
    });
    console.log("\nOK — transaccion confirmada.");
  } catch (e) {
    console.error("FALLO (rollback):", e.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
})();
