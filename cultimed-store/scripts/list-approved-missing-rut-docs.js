// Lista cuentas aprobadas sin RUT y su documento de receta.
require("fs").readFileSync(".env.local", "utf8").split(/\r?\n/).forEach((line) => {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
});
const postgres = require("postgres");
const sql = postgres(process.env.DATABASE_URL, { prepare: false, ssl: "require", max: 1 });

(async () => {
  const rows = await sql`
    SELECT id, email, full_name, prescription_url, prescription_uploaded_at
    FROM customer_accounts
    WHERE prescription_status = 'aprobada'
      AND (rut IS NULL OR TRIM(rut) = '')
    ORDER BY id
  `;
  console.log(JSON.stringify(rows, null, 2));
  await sql.end();
})().catch((e) => { console.error(e); process.exit(1); });
