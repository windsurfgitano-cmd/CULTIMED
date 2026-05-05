// Asegura que rincondeoz@gmail.com exista con password "caca123" y receta aprobada
// para poder correr el E2E flow.
require("fs").readFileSync(".env.local", "utf8").split(/\r?\n/).forEach((l) => {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
});
const postgres = require("postgres");
const bcrypt = require("bcryptjs");

(async () => {
  const sql = postgres(process.env.DATABASE_URL, { prepare: false, ssl: "require", max: 1 });

  // Schema check
  const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='customer_accounts' ORDER BY ordinal_position`;
  const colNames = cols.map((c) => c.column_name);
  console.log("customer_accounts cols:", colNames.join(","));

  const email = "rincondeoz@gmail.com";
  const hash = await bcrypt.hash("caca123", 10);

  // Existing?
  const existing = await sql`SELECT id, email, prescription_status FROM customer_accounts WHERE email = ${email}`;
  if (existing.length > 0) {
    const id = existing[0].id;
    console.log(`Existing customer id=${id} status=${existing[0].prescription_status}`);
    await sql`UPDATE customer_accounts SET password_hash = ${hash}, prescription_status = 'aprobada' WHERE id = ${id}`;
    console.log(`✓ Updated password + set prescription_status=aprobada`);
  } else {
    const inserted = await sql`
      INSERT INTO customer_accounts (email, password_hash, full_name, prescription_status)
      VALUES (${email}, ${hash}, 'Oscar Test', 'aprobada')
      RETURNING id
    `;
    console.log(`✓ Created customer id=${inserted[0].id}`);
  }

  await sql.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
