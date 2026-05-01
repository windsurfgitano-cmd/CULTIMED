// Resetea las secuencias BIGSERIAL para que próximos INSERTs no choquen.
const postgres = require("postgres");

const PG_URL = process.env.DATABASE_URL;
if (!PG_URL) { console.error("✗ DATABASE_URL no definido"); process.exit(1); }

const TABLES = [
  "staff", "doctors", "patients", "products", "batches",
  "prescriptions", "prescription_items",
  "dispensations", "dispensation_items", "inventory_movements", "audit_logs",
  "customer_accounts", "customer_orders", "customer_order_items", "customer_order_events",
  "referral_codes", "referral_conversions", "referral_payouts", "referral_commissions"
];

const sql = postgres(PG_URL, { max: 1, ssl: "require", prepare: false });

(async () => {
  for (const t of TABLES) {
    try {
      const r = await sql.unsafe(
        `SELECT setval(pg_get_serial_sequence('${t}', 'id'), COALESCE((SELECT MAX(id) FROM ${t}), 1), true) AS new_val`
      );
      console.log(`  ${t}: next id = ${Number(r[0].new_val) + 1}`);
    } catch (e) {
      console.log(`  ${t}: skip (${e.message.slice(0, 80)})`);
    }
  }
  await sql.end();
  console.log("✓ Secuencias listas");
})();
