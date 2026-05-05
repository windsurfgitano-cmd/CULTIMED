// E2E helper: simula upload de comprobante (la extensión bloquea file_upload).
// Marca la orden 2 como proof_uploaded e inserta evento.
require("fs").readFileSync(".env.local", "utf8").split(/\r?\n/).forEach((l) => {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
});
const postgres = require("postgres");
const sql = postgres(process.env.DATABASE_URL, { prepare: false, ssl: "require", max: 1 });

(async () => {
  const orderId = parseInt(process.argv[2] || "2", 10);
  const fakeUrl = "https://ibkhvopshhlbvjwrmuzm.supabase.co/storage/v1/object/public/email-assets/products/the-hive-bloom-seed-co.png"; // placeholder
  const updated = await sql`
    UPDATE customer_orders
    SET payment_proof_url = ${fakeUrl},
        payment_proof_uploaded_at = CURRENT_TIMESTAMP,
        status = 'proof_uploaded',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ${orderId}
    RETURNING id, status, folio
  `;
  if (updated.length === 0) {
    console.error("✗ Order not found:", orderId);
    process.exit(1);
  }
  await sql`INSERT INTO customer_order_events (order_id, event_type, message) VALUES (${orderId}, 'proof_uploaded', 'Comprobante de transferencia recibido (E2E test)')`;
  console.log("✓", updated[0]);
  await sql.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
