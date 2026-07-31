// Ajuste del drop de agosto 2026 pedido por Oscar:
//  - Zkittlez y Wedding Cheesecake pasan a COMPRA INMEDIATA (ya tienen stock real).
//  - Cream Caramel se confirma activa (sin cambios, solo verificacion).
//  - Banana Purple Punch y Lemon Pie quedan en RESERVA sin stock: el 100g que se
//    precargo para el drop no era inventario real todavia, asi que se retira el
//    lote (no se deja un lote fantasma en 0, se elimina — no existia fisicamente).
// Correr desde cultimed-store/:  node scripts/activar-zkittlez-weddingcheesecake.js
const fs = require("fs");
const path = require("path");
const postgres = require("postgres");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
const sql = postgres(url, { prepare: false, ssl: "require", max: 1 });

const ACTIVAR = ["zkittlez", "wedding-cheesecake"];
const SIN_STOCK = ["banana-purple-punch-auto", "lemon-pie"];

(async () => {
  try {
    await sql.begin(async (tx) => {
      for (const sku of ACTIVAR) {
        const r = await tx.unsafe(
          `UPDATE products SET is_preorder = 0, preorder_available_at = NULL, updated_at = now()
           WHERE sku = $1 RETURNING id, name`, [sku]);
        if (!r.length) throw new Error(`No encontre ${sku}`);
        console.log(`ACTIVA   ${r[0].name} (id=${r[0].id}) — compra inmediata`);
      }
      for (const sku of SIN_STOCK) {
        const p = await tx.unsafe(`SELECT id, name FROM products WHERE sku = $1`, [sku]);
        if (!p.length) throw new Error(`No encontre ${sku}`);
        const del = await tx.unsafe(
          `DELETE FROM batches WHERE product_id = $1 RETURNING batch_number`, [p[0].id]);
        console.log(`RESERVA  ${p[0].name} (id=${p[0].id}) — se retiro el lote ${del.map(d=>d.batch_number).join(", ") || "(sin lotes)"}, sigue en reserva`);
      }
      const cc = await tx.unsafe(
        `SELECT name, is_preorder FROM products WHERE sku = 'cream-caramel-f1-fast-version'`);
      console.log(`CONFIRMA ${cc[0].name} — is_preorder=${cc[0].is_preorder} (0 = activa, sin cambios)`);
    });
    console.log("\nOK — transaccion confirmada.");
  } catch (e) {
    console.error("FALLO (rollback):", e.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
})();
