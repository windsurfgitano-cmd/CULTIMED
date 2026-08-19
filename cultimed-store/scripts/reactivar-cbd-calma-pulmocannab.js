// A peticion de Oscar ("habilita ambos cbd con stock"): reactiva las dos
// lineas CBD del catalogo -- Aceite Sublingual CALMA (10ML/30ML) y
// PulmoCannab (0.5ML/1.0ML). Ninguna necesita stock nuevo: sus lotes
// quedaron intactos cuando se archivaron (misma politica de todo este
// trabajo -- archivar nunca borra ni toca el inventario real), asi que "con
// stock" ya se cumple con lo que tenian: 3g/59g CALMA, 10u/10u PulmoCannab.
//
// Correr desde cultimed-store/:  node scripts/reactivar-cbd-calma-pulmocannab.js
const fs = require("fs");
const path = require("path");
const postgres = require("postgres");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
const sql = postgres(url, { prepare: false, ssl: "require", max: 1 });

const STAFF_ID = 5;
const SKUS = [
  "ACEITE-SUBLINGUAL-CALMA-10ML",
  "ACEITE-SUBLINGUAL-CALMA-30ML",
  "pulmocannab-05ml",
  "pulmocannab-10ml",
];

(async () => {
  try {
    await sql.begin(async (tx) => {
      for (const sku of SKUS) {
        const p = await tx`SELECT id, name FROM products WHERE sku = ${sku}`;
        if (!p.length) throw new Error(`No encontre ${sku}`);
        const id = p[0].id;

        await tx`
          UPDATE products SET is_active = 1, shopify_status = 'active', updated_at = now()
          WHERE id = ${id}`;

        const b = await tx`SELECT batch_number, quantity_current FROM batches WHERE product_id=${id} AND status='available'`;

        await tx`
          INSERT INTO audit_logs (staff_id, action, entity_type, entity_id, details)
          VALUES (${STAFF_ID}, 'product_activated', 'product', ${id},
            ${JSON.stringify({ mode: "active", motivo: "Reactivada a peticion de Oscar (\"habilita ambos cbd con stock\") -- lote existente sin tocar" })})`;

        console.log(`OK  ${p[0].name} (id=${id}) — reactivada, stock: ${b.map(x=>`${x.batch_number}=${x.quantity_current}`).join(", ")}`);
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
