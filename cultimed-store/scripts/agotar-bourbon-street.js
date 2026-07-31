// Bourbon Street - LIT Farms (venta a granel, sku BST-LIT-GRANEL, id=21) se
// agoto: "no quedan" (Oscar). Replica EXACTAMENTE la accion real del panel
// "Marcar agotado" (setWebStatus en cultisoft/app/(app)/products/page.tsx):
// is_active=0, shopify_status='archived'. Con eso isReachable() lo saca de
// alcanzable (lib/availability.ts) y la tarjeta muestra el sello "Agotado" en
// el catalogo — poner el lote en 0 por si solo NO alcanzaba, porque
// isReachable no depende del stock.
//
// El lote se marca 'depleted' (no se borra): a diferencia del stock placeholder
// que se retiro de Banana/Lemon Pie, este SI fue inventario real que se vendio
// — borrar el lote destruiria la trazabilidad. Mismo patron que las otras 3
// variantes de Bourbon (5g/10g/20g) ya archivadas, que tambien quedaron
// 'depleted' en vez de eliminadas.
//
// Correr desde cultimed-store/:  node scripts/agotar-bourbon-street.js
const fs = require("fs");
const path = require("path");
const postgres = require("postgres");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
const sql = postgres(url, { prepare: false, ssl: "require", max: 1 });

const STAFF_ID = 5; // rincondeoz@gmail.com, superadmin

(async () => {
  try {
    await sql.begin(async (tx) => {
      const p = await tx`
        SELECT id, sku, name FROM products WHERE sku = 'BST-LIT-GRANEL'`;
      if (!p.length) throw new Error("No encontre BST-LIT-GRANEL");
      const id = p[0].id;

      await tx`
        UPDATE products SET is_active = 0, shopify_status = 'archived', updated_at = now()
        WHERE id = ${id}`;

      const b = await tx`
        UPDATE batches SET quantity_current = 0, status = 'depleted'
        WHERE product_id = ${id} AND status = 'available'
        RETURNING batch_number, quantity_initial`;

      await tx`
        INSERT INTO audit_logs (staff_id, action, entity_type, entity_id, details)
        VALUES (${STAFF_ID}, 'product_archived', 'product', ${id},
          ${JSON.stringify({ mode: "archived", motivo: "Sin stock (\"no quedan\"), via script a peticion de Oscar" })})`;

      console.log(`OK  ${p[0].name} (id=${id}) — is_active=0, shopify_status=archived`);
      b.forEach(r => console.log(`    lote ${r.batch_number} -> depleted (tenia ${r.quantity_initial}g inicial)`));
    });
    console.log("\nOK — transaccion confirmada.");
  } catch (e) {
    console.error("FALLO (rollback):", e.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
})();
