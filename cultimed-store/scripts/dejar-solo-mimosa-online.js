// A peticion explicita de Oscar (confirmada: "TODO el catalogo activo, sin
// excepcion"): desactiva absolutamente todos los productos activos EXCEPTO
// Mimosa EVO. Mismo patron real que "Marcar agotado" del panel (is_active=0,
// shopify_status='archived'). Los lotes NO se tocan -- queda reversible,
// mismo criterio que se uso con Lemon Pie.
//
// Correr desde cultimed-store/:  node scripts/dejar-solo-mimosa-online.js
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
      const toArchive = await tx`
        SELECT id, sku, name FROM products
        WHERE is_active = 1 AND sku <> 'mimosa-evo'
        ORDER BY id`;

      for (const p of toArchive) {
        await tx`
          UPDATE products SET is_active = 0, shopify_status = 'archived', updated_at = now()
          WHERE id = ${p.id}`;
        await tx`
          INSERT INTO audit_logs (staff_id, action, entity_type, entity_id, details)
          VALUES (${STAFF_ID}, 'product_archived', 'product', ${p.id},
            ${JSON.stringify({ mode: "archived", motivo: "Deja solo Mimosa EVO online -- peticion explicita de Oscar, confirmada para TODO el catalogo activo. Lote no tocado." })})`;
        console.log(`DESACTIVA  ${p.name} (id=${p.id}, ${p.sku})`);
      }

      const mimosa = await tx`SELECT id, name, is_active FROM products WHERE sku = 'mimosa-evo'`;
      console.log(`\nCONFIRMA   ${mimosa[0].name} (id=${mimosa[0].id}) — is_active=${mimosa[0].is_active}, sin cambios.`);
      console.log(`\nTotal desactivados: ${toArchive.length}`);
    });
    console.log("\nOK — transaccion confirmada.");
  } catch (e) {
    console.error("FALLO (rollback):", e.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
})();
