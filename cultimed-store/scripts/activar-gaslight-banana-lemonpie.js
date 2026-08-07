// Activa para dispensado (compra inmediata) 3 cepas con 100g cada una,
// a peticion de Oscar:
//  - Gaslight (GASLIGHT-PURPLE-GRANEL, id=22): ya estaba is_active=1/preorder=0,
//    solo le faltaba stock real (tenia 0g).
//  - Banana Purple Punch Auto (id=29) y Lemon Pie (id=31): estaban en reserva
//    (is_preorder=1) sin stock (se les habia retirado el placeholder del drop
//    de agosto). Pasan a compra inmediata con 100g reales.
// Zkittlez y Wedding Cheesecake NO se tocan: ya tienen stock real propio
// (69g y 85g respectivamente) de una correccion anterior — no se pisa.
//
// Correr desde cultimed-store/:  node scripts/activar-gaslight-banana-lemonpie.js
const fs = require("fs");
const path = require("path");
const postgres = require("postgres");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
const sql = postgres(url, { prepare: false, ssl: "require", max: 1 });

const STOCK_G = 100;
const MANUF = "2026-08-05"; // hoy
const EXPIRY = "2027-08-05"; // ~12 meses, estimacion operativa (ajustable en el panel)

const ITEMS = [
  { id: 22, sku: "GASLIGHT-PURPLE-GRANEL", nombre: "Gaslight", price: 8998, activarPreorder: false },
  { id: 29, sku: "banana-purple-punch-auto", nombre: "Banana Purple Punch Auto", price: 8998, activarPreorder: true },
  { id: 31, sku: "lemon-pie", nombre: "Lemon Pie", price: 8998, activarPreorder: true },
];

(async () => {
  try {
    await sql.begin(async (tx) => {
      for (const it of ITEMS) {
        const p = await tx`SELECT id, name, vendor FROM products WHERE id = ${it.id}`;
        if (!p.length) throw new Error(`No encontre producto id=${it.id}`);

        if (it.activarPreorder) {
          await tx`
            UPDATE products SET is_preorder = 0, preorder_available_at = NULL, updated_at = now()
            WHERE id = ${it.id}`;
        }

        const bn = `${it.sku.toUpperCase()}-DISPENSADO-100G`;
        await tx`DELETE FROM batches WHERE product_id = ${it.id} AND batch_number = ${bn}`;
        await tx`
          INSERT INTO batches
            (product_id, batch_number, quantity_initial, quantity_current, price_per_unit,
             manufacture_date, expiry_date, supplier, status, notes)
          VALUES (${it.id}, ${bn}, ${STOCK_G}, ${STOCK_G}, ${it.price},
             ${MANUF}, ${EXPIRY}, ${p[0].vendor}, 'available',
             'Activacion para dispensado inmediato, 100g, a peticion de Oscar')`;

        console.log(`OK  ${p[0].name} (id=${it.id}) — ${STOCK_G}g cargados${it.activarPreorder ? ", is_preorder=0" : ""}`);
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
