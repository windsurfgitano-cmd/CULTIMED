// A peticion de Oscar:
//  - Lemon Pie (id=31) se desactiva. Replica exacto "Marcar agotado" del panel
//    (is_active=0, shopify_status='archived'). NO se toca el lote (Oscar no
//    dijo que se agoto, solo que la saque de venta) -- el stock de 100g queda
//    intacto por si la reactiva despues.
//  - Banana Purple Punch Auto: ya estaba activa con 100g (verificado antes de
//    correr este script) -- no requiere ningun cambio, no se toca.
//  - Mimosa EVO (Barney's Farm, Clementine x Purple Punch + Orange Punch)
//    se agrega nueva: 100g, precio mas alto que las demas (+$300/g sobre la
//    escalera estandar, a peticion de Oscar).
//
// Fuente de la ficha tecnica: barneysfarm.com/mimosa-evo-510, corroborado con
// busqueda cruzada (60% indica/40% sativa, THC tipico 24-26%, hasta 30%
// segun el criador -- se guarda 24% como valor conservador documentado).
//
// Correr desde cultimed-store/:  node scripts/desactivar-lemonpie-agregar-mimosa.js
const fs = require("fs");
const path = require("path");
const postgres = require("postgres");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
const sql = postgres(url, { prepare: false, ssl: "require", max: 1 });

const IMAGE_URL = "https://ibkhvopshhlbvjwrmuzm.supabase.co/storage/v1/object/public/email-assets/products/mimosa-evo-ingredientes.png";
const STAFF_ID = 5; // rincondeoz@gmail.com, superadmin

// Escalera estandar + $300/g parejo en los 4 tramos, a peticion de Oscar
// ("es mas cara que las demas").
const LADDER_MIMOSA = [
  { desde_g: 1, precio_g: 9298 },
  { desde_g: 6, precio_g: 8899 },
  { desde_g: 11, precio_g: 8299.5 },
  { desde_g: 21, precio_g: 7800 },
];
const STOCK_G = 100;
const MANUF = "2026-08-11";
const EXPIRY = "2027-08-11";

const DESC = "Mimosa EVO (Barney's Farm): cruce de Mimosa (Clementine x Purple Punch) con Orange Punch, version potenciada de la Mimosa original. Hibrido de dominancia indica (60% indica / 40% sativa), feminizada, fotodependiente (no autofloreciente). El criador informa THC tipico de 24-26% (hasta 30% en fenotipos selectos) y CBD residual (<1%). Floracion de 65-70 dias. Rendimiento interior 700-800 g/m2, exterior hasta 2000 g/planta. Perfil aromatico citrico tropical: limon, naranja y mandarina, con notas de bayas y un fondo tipo ponche de frutas. Terpenos principales: cariofileno, limoneno, pineno, ocimeno y terpinoleno. Efectos: animo elevado, relajacion y sensacion de bienestar.";

(async () => {
  try {
    await sql.begin(async (tx) => {
      // 1) Desactivar Lemon Pie (sin tocar el lote)
      const lp = await tx`
        UPDATE products SET is_active = 0, shopify_status = 'archived', updated_at = now()
        WHERE sku = 'lemon-pie' RETURNING id, name`;
      if (!lp.length) throw new Error("No encontre lemon-pie");
      console.log(`DESACTIVA  ${lp[0].name} (id=${lp[0].id}) — is_active=0, shopify_status=archived. Lote intacto.`);
      await tx`
        INSERT INTO audit_logs (staff_id, action, entity_type, entity_id, details)
        VALUES (${STAFF_ID}, 'product_archived', 'product', ${lp[0].id},
          ${JSON.stringify({ mode: "archived", motivo: "Desactivada a peticion de Oscar (sin especificar sin-stock; lote no tocado)" })})`;

      // 2) Confirmar Banana Purple Punch (sin cambios)
      const bpp = await tx`SELECT name, is_active, is_preorder FROM products WHERE sku='banana-purple-punch-auto'`;
      console.log(`CONFIRMA   ${bpp[0].name} — ya estaba activa (is_active=${bpp[0].is_active}, preorder=${bpp[0].is_preorder}), sin cambios.`);

      // 3) Agregar Mimosa EVO
      const rows = await tx`
        INSERT INTO products
          (sku, name, category, presentation, unit, requires_prescription, is_controlled,
           default_price, price_tiers, description, vendor, is_house_brand,
           is_preorder, shopify_status, is_active, image_url, strain_key,
           thc_percentage, cbd_percentage)
        VALUES ('mimosa-evo', 'Mimosa EVO', 'flores', 'Flor a granel', 'gramo', 1, 0,
           ${LADDER_MIMOSA[0].precio_g}, ${JSON.stringify(LADDER_MIMOSA)}::jsonb, ${DESC}, ${"Barney's Farm"}, 0,
           0, 'active', 1, ${IMAGE_URL}, 'mimosa-evo',
           24, 1)
        ON CONFLICT (sku) DO UPDATE SET
          name=EXCLUDED.name, default_price=EXCLUDED.default_price, price_tiers=EXCLUDED.price_tiers,
          description=EXCLUDED.description, vendor=EXCLUDED.vendor, shopify_status='active',
          is_active=1, image_url=EXCLUDED.image_url, thc_percentage=EXCLUDED.thc_percentage,
          cbd_percentage=EXCLUDED.cbd_percentage, updated_at=now()
        RETURNING id, name`;
      const mimosaId = rows[0].id;

      const bn = "MIMOSA-EVO-LOTE-1";
      await tx`DELETE FROM batches WHERE product_id = ${mimosaId} AND batch_number = ${bn}`;
      await tx`
        INSERT INTO batches
          (product_id, batch_number, quantity_initial, quantity_current, price_per_unit,
           manufacture_date, expiry_date, supplier, status, notes)
        VALUES (${mimosaId}, ${bn}, ${STOCK_G}, ${STOCK_G}, ${LADDER_MIMOSA[0].precio_g},
           ${MANUF}, ${EXPIRY}, ${"Barney's Farm"}, 'available',
           'Carga inicial, 100g, precio +$300/g sobre la escalera estandar')`;

      console.log(`AGREGA     ${rows[0].name} (id=${mimosaId}) — ${STOCK_G}g, escalera desde $${LADDER_MIMOSA[0].precio_g}/g hasta $${LADDER_MIMOSA[3].precio_g}/g`);
    });
    console.log("\nOK — transaccion confirmada.");
  } catch (e) {
    console.error("FALLO (rollback):", e.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
})();
