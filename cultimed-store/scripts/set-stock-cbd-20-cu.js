// A peticion de Oscar ("20 c/u"), respondiendo al aviso de que CALMA 10ML
// tenia solo 3 unidades: ajusta el lote real existente de las 4 presentaciones
// CBD (CALMA 10ML/30ML, PulmoCannab 0.5ML/1.0ML) a exactamente 20 unidades
// cada una. OJO: CALMA 30ML baja de 59 a 20 (no es solo un top-up de las
// bajas) -- se interpreto "20 c/u" como valor exacto parejo, mismo patron que
// "Deja: 20g wedding cake, 20g banana" de antes. Ajusta el lote existente
// (no crea uno nuevo), preservando trazabilidad del batch_number real.
//
// Correr desde cultimed-store/:  node scripts/set-stock-cbd-20-cu.js
const fs = require("fs");
const path = require("path");
const postgres = require("postgres");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
const sql = postgres(url, { prepare: false, ssl: "require", max: 1 });

const STAFF_ID = 5;
const TARGET = 20;
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

        const b = await tx`
          SELECT id, batch_number, quantity_current FROM batches
          WHERE product_id = ${id} AND status = 'available' ORDER BY id DESC LIMIT 1`;
        if (!b.length) throw new Error(`${sku}: sin lote 'available'`);

        await tx`UPDATE batches SET quantity_current = ${TARGET} WHERE id = ${b[0].id}`;

        await tx`
          INSERT INTO audit_logs (staff_id, action, entity_type, entity_id, details)
          VALUES (${STAFF_ID}, 'stock_adjusted', 'product', ${id},
            ${JSON.stringify({ motivo: "\"20 c/u\" a peticion de Oscar", lote: b[0].batch_number, stock_anterior: b[0].quantity_current, stock_nuevo: TARGET })})`;

        console.log(`OK  ${p[0].name} — lote ${b[0].batch_number}: ${b[0].quantity_current} -> ${TARGET}`);
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
