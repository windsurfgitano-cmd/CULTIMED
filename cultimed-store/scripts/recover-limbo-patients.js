// Recupera cuentas en limbo: customer_accounts con RUT pero sin patient_id.
// Crea o vincula patients por RUT normalizado. Uso:
//   node scripts/recover-limbo-patients.js --dry-run
//   node scripts/recover-limbo-patients.js --apply
require("fs").readFileSync(".env.local", "utf8").split(/\r?\n/).forEach((line) => {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
});

const postgres = require("postgres");
const APPLY = process.argv.includes("--apply");
const sql = postgres(process.env.DATABASE_URL, { prepare: false, ssl: "require", max: 1 });

function displayName(row) {
  const name = String(row.full_name || "").trim();
  if (name) return name;
  return String(row.email || `Paciente ${row.id}`).split("@")[0].replace(/[._-]+/g, " ").trim() || `Paciente ${row.id}`;
}

(async () => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL no definido");

  const accounts = await sql.unsafe(`
    SELECT ca.id, ca.email, ca.full_name, ca.rut, ca.phone, ca.patient_id, ca.prescription_status,
           ca.created_at
    FROM customer_accounts ca
    WHERE ca.patient_id IS NULL
      AND ca.rut IS NOT NULL
      AND TRIM(ca.rut) != ''
    ORDER BY ca.id ASC
  `);

  let created = 0;
  let linked = 0;
  let skipped = 0;

  console.log(`${APPLY ? "APPLY" : "DRY-RUN"}: ${accounts.length} cuentas con RUT sin patient_id`);

  for (const acc of accounts) {
    const rutNorm = String(acc.rut || "").replace(/\./g, "").replace(/\s/g, "").toUpperCase();
    const patients = await sql`
      SELECT id, rut, full_name
      FROM patients
      WHERE UPPER(REPLACE(REPLACE(COALESCE(rut,''), '.', ''), ' ', '')) = ${rutNorm}
      LIMIT 1
    `;
    const p = patients[0];

    if (APPLY) {
      if (p) {
        await sql`
          UPDATE patients
             SET email = COALESCE(email, ${acc.email}),
                 phone = COALESCE(phone, ${acc.phone || null}),
                 updated_at = CURRENT_TIMESTAMP
           WHERE id = ${p.id}
        `;
        await sql`UPDATE customer_accounts SET patient_id = ${p.id}, updated_at = CURRENT_TIMESTAMP WHERE id = ${acc.id}`;
        linked++;
        console.log(`LINK ca=${acc.id} -> patient=${p.id} | ${acc.email} | ${acc.rut}`);
      } else {
        const inserted = await sql`
          INSERT INTO patients (rut, full_name, email, phone, membership_status, membership_started_at)
          VALUES (${acc.rut}, ${displayName(acc)}, ${acc.email}, ${acc.phone || null}, 'active', CURRENT_TIMESTAMP)
          RETURNING id
        `;
        await sql`UPDATE customer_accounts SET patient_id = ${inserted[0].id}, updated_at = CURRENT_TIMESTAMP WHERE id = ${acc.id}`;
        created++;
        console.log(`CREATE ca=${acc.id} -> patient=${inserted[0].id} | ${acc.email} | ${acc.rut}`);
      }
    } else {
      if (p) {
        linked++;
        console.log(`WOULD LINK ca=${acc.id} -> patient=${p.id} | ${acc.email} | ${acc.rut}`);
      } else {
        created++;
        console.log(`WOULD CREATE ca=${acc.id} | ${acc.email} | ${acc.rut} | ${displayName(acc)}`);
      }
    }
  }

  const noRutApproved = await sql`
    SELECT COUNT(*)::int AS c
    FROM customer_accounts
    WHERE patient_id IS NULL
      AND prescription_status = 'aprobada'
      AND (rut IS NULL OR TRIM(rut) = '')
  `;

  console.log("\nResumen:", { created, linked, skipped, approvedWithoutRut: noRutApproved[0].c });
  await sql.end();
})().catch((e) => { console.error(e); process.exit(1); });
