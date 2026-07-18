// Migracion: tabla de reservas en firme (PREVENTA / PREDISPENSADO).
// Una reserva NO es una venta: no tiene monto ni pago, solo el compromiso del paciente.
// Por eso vive en su propia tabla y NUNCA en customer_orders.
//
// Comando exacto (desde cultimed-store/, porque .env.local se lee relativo al cwd):
//   cd C:/Users/Ozymandias/Documents/CultiSoft/cultimed-store && node scripts/extend-schema-reservations.js
//
// Idempotente: se puede re-ejecutar sin efectos (CREATE TABLE / INDEX IF NOT EXISTS).
require("fs").readFileSync(".env.local", "utf8").split(/\r?\n/).forEach((l) => {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
});
const postgres = require("postgres");

(async () => {
  const sql = postgres(process.env.DATABASE_URL, { prepare: false, ssl: "require", max: 1 });

  // status: 'pendiente' | 'cumplida' | 'cancelada'
  await sql`
    CREATE TABLE IF NOT EXISTS product_reservations (
      id BIGSERIAL PRIMARY KEY,
      product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      customer_account_id BIGINT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
      quantity_grams NUMERIC,
      status TEXT NOT NULL DEFAULT 'pendiente',
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;

  // Un paciente no puede reservar dos veces el mismo producto.
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS product_reservations_uniq ON product_reservations (product_id, customer_account_id)`;
  // Listados del panel: reservas por producto.
  await sql`CREATE INDEX IF NOT EXISTS product_reservations_product_idx ON product_reservations (product_id)`;

  const cols = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='product_reservations' ORDER BY ordinal_position`;
  console.log("✓ product_reservations:", cols.map((c) => `${c.column_name}:${c.data_type}`).join(", "));

  const idx = await sql`SELECT indexname FROM pg_indexes WHERE tablename='product_reservations' ORDER BY indexname`;
  console.log("✓ indices:", idx.map((i) => i.indexname).join(", "));
  console.log(idx.some((i) => i.indexname === "product_reservations_uniq") ? "✓ indice unico presente" : "✗ FALTA product_reservations_uniq");
  console.log(idx.some((i) => i.indexname === "product_reservations_product_idx") ? "✓ indice por product_id presente" : "✗ FALTA product_reservations_product_idx");

  await sql.end();
})().catch((e) => { console.error("✗", e.message); process.exit(1); });
