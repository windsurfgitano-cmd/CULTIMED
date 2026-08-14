// A peticion de Oscar ("Deja: 20g wedding cake, 20g banana, 100g mimosa"):
// reactiva Banana Purple Punch Auto y Wedding Cheesecake (asumiendo "wedding
// cake" = Wedding Cheesecake, mismo criterio confirmado la vez anterior --
// NO la vieja "Wedding Cake LitFarms", que sigue archivada sin tocar), y
// ajusta sus lotes reales existentes a exactamente 20g cada uno (no crea
// lotes nuevos, ajusta quantity_current sobre el lote real que ya tenian).
// Mimosa EVO ya estaba activa con 100g -- sin cambios.
//
// Correr desde cultimed-store/:  node scripts/reactivar-banana-weddingcheesecake-20g.js
const fs = require("fs");
const path = require("path");
const postgres = require("postgres");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
const sql = postgres(url, { prepare: false, ssl: "require", max: 1 });

const STAFF_ID = 5;
const TARGET_G = 20;
const SKUS = ["banana-purple-punch-auto", "wedding-cheesecake"];

(async () => {
  try {
    await sql.begin(async (tx) => {
      for (const sku of SKUS) {
        const p = await tx`SELECT id, name, is_active FROM products WHERE sku = ${sku}`;
        if (!p.length) throw new Error(`No encontre ${sku}`);
        const id = p[0].id;

        await tx`
          UPDATE products SET is_active = 1, shopify_status = 'active', updated_at = now()
          WHERE id = ${id}`;

        const b = await tx`
          SELECT id, batch_number, quantity_current FROM batches
          WHERE product_id = ${id} AND status = 'available' ORDER BY id DESC LIMIT 1`;
        if (!b.length) throw new Error(`${sku}: no tiene lote 'available' para ajustar`);

        await tx`UPDATE batches SET quantity_current = ${TARGET_G} WHERE id = ${b[0].id}`;

        await tx`
          INSERT INTO audit_logs (staff_id, action, entity_type, entity_id, details)
          VALUES (${STAFF_ID}, 'product_activated', 'product', ${id},
            ${JSON.stringify({ mode: "active", motivo: `Reactivada a ${TARGET_G}g a peticion de Oscar`, lote: b[0].batch_number, stock_anterior: b[0].quantity_current })})`;

        console.log(`OK  ${p[0].name} (id=${id}) — reactivada, lote ${b[0].batch_number} ${b[0].quantity_current}g -> ${TARGET_G}g`);
      }

      const mimosa = await tx`SELECT name, is_active FROM products WHERE sku='mimosa-evo'`;
      console.log(`CONFIRMA  ${mimosa[0].name} — is_active=${mimosa[0].is_active}, sin cambios (ya estaba en 100g).`);
    });
    console.log("\nOK — transaccion confirmada.");
  } catch (e) {
    console.error("FALLO (rollback):", e.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
})();
