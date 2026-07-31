// Carga PulmoCannab (inhalador/vaporizador de CBD, formulacion magistral),
// dos presentaciones (0.5ML / 1.0ML), siguiendo el mismo patron que
// Aceite Sublingual CALMA (mismo vendor, mismo strain_key compartido, sin
// price_tiers). Idempotente: correr dos veces no duplica ni apila stock.
//
// OJO — decisiones que el operador/QF debe revisar antes de vender:
//  - expiry_date queda NULL a proposito: el vencimiento de una formulacion
//    magistral lo fija el quimico farmaceutico segun sus propios estudios de
//    estabilidad, no es un dato que se deba inventar aqui. Cargarlo en el
//    panel (editar lote) antes de dispensar.
//  - batch_number es un correlativo generado, no un numero de lote SANNA real.
//  - Se asumio vendor "Cultimed Dispensario" / is_house_brand=1 (mismo patron
//    que CALMA, formulacion propia). Corregir en el panel si es de un tercero.
//  - Stock 20 unidades repartido 10/10 entre las dos presentaciones (no se
//    especifico el reparto real) — ajustar en el panel si es distinto.
//
// Correr desde cultimed-store/:  node scripts/seed-pulmocannab.js
const fs = require("fs");
const path = require("path");
const postgres = require("postgres");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
if (!url) { console.error("Falta DATABASE_URL"); process.exit(1); }
const sql = postgres(url, { prepare: false, ssl: "require", max: 1 });

const IMAGE_URL = "https://ibkhvopshhlbvjwrmuzm.supabase.co/storage/v1/object/public/email-assets/products/pulmocannab.png";
const STRAIN_KEY = "pulmocannab";
const VENDOR = "Cultimed Dispensario";
const MANUF = "2026-07-25"; // hoy
const UNITS_PER_VARIANT = 10; // 20 totales / 2 presentaciones

const DESC = `PulmoCannab — inhalador de Cannabidiol (CBD) grado farmaceutico, formulacion magistral preparada bajo supervision de quimico farmaceutico. Principio activo: Cannabidiol (CBD) grado farmaceutico, pureza >=99.5% (destilado de amplio espectro o aislado), sin THC detectable o <0.2%. Forma farmaceutica: solucion para inhalacion por vaporizador, cartucho hermetico precargado con atomizador de ceramica y rosca universal (tipo 510), con sistema inviolable y boquilla sellada. MODO DE USO: segun indicacion de tu medico tratante y quimico farmaceutico — via inhalatoria exclusivamente. PRESENTACIONES: 0.5ML y 1.0ML. Producto dispensado bajo receta medica vigente, conforme a la Ley 20.850.`;

const VARIANTS = [
  { sku: "pulmocannab-05ml", presentation: "0.5ML", price: 29990 },
  { sku: "pulmocannab-10ml", presentation: "1.0ML", price: 44990 },
];

(async () => {
  try {
    await sql.begin(async (tx) => {
      for (const v of VARIANTS) {
        const rows = await tx.unsafe(
          `INSERT INTO products
             (sku, name, category, presentation, active_ingredient, unit,
              requires_prescription, is_controlled, default_price, description,
              vendor, is_house_brand, is_preorder, shopify_status, is_active,
              image_url, strain_key)
           VALUES ($1,$2,'farmaceutico',$3,'Cannabidiol','ml',
              1,0,$4,$5,
              $6,1,0,'active',1,
              $7,$8)
           ON CONFLICT (sku) DO UPDATE SET
             name=EXCLUDED.name, presentation=EXCLUDED.presentation,
             default_price=EXCLUDED.default_price, description=EXCLUDED.description,
             vendor=EXCLUDED.vendor, shopify_status='active', is_active=1,
             image_url=EXCLUDED.image_url, strain_key=EXCLUDED.strain_key,
             updated_at=now()
           RETURNING id`,
          [v.sku, `PulmoCannab (${v.presentation})`, v.presentation, v.price, DESC,
           VENDOR, IMAGE_URL, STRAIN_KEY]);
        const productId = rows[0].id;

        // Lote: idempotente (borra nuestro lote deterministico antes de recrear).
        const bn = `${v.sku.toUpperCase()}-LOTE-1`;
        await tx.unsafe(`DELETE FROM batches WHERE product_id = $1 AND batch_number = $2`,
          [productId, bn]);
        await tx.unsafe(
          `INSERT INTO batches
             (product_id, batch_number, quantity_initial, quantity_current,
              price_per_unit, manufacture_date, expiry_date, supplier, status, notes)
           VALUES ($1,$2,$3,$3,$4,$5,NULL,$6,'available',$7)`,
          [productId, bn, UNITS_PER_VARIANT, v.price, MANUF, VENDOR,
           "PENDIENTE: fecha de vencimiento la debe fijar el QF antes de dispensar."]);

        console.log(`OK  ${v.presentation}  id=${productId}  lote=${bn}  stock=${UNITS_PER_VARIANT}u  $${v.price}`);
      }
    });
    console.log("\nOK — transaccion confirmada.");
  } catch (e) {
    console.error("FALLO (rollback):", e.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
})();
