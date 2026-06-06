// Aplica matches de OCR de alta confianza para cuentas aprobadas sin RUT.
// Uso: node scripts/apply-ocr-rut-matches.js <report.json> --dry-run|--apply
require("fs").readFileSync(".env.local", "utf8").split(/\r?\n/).forEach((line) => {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
});

const fs = require("node:fs");
const postgres = require("postgres");

const reportPath = process.argv[2];
const APPLY = process.argv.includes("--apply");
if (!reportPath) {
  console.error("Uso: node scripts/apply-ocr-rut-matches.js <report.json> --dry-run|--apply");
  process.exit(1);
}
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const sql = postgres(process.env.DATABASE_URL, { prepare: false, ssl: "require", max: 1 });

function displayName(item) {
  return item.suggested?.structured?.patientName || item.fullName || item.email.split("@")[0].replace(/[._-]+/g, " ");
}

(async () => {
  const candidates = report.filter((item) => {
    const s = item.suggested?.structured;
    if (!s?.patientRut || !s?.patientName) return false;
    if (item.status !== "extracted") return false;
    // Alta confianza: patrón explícito de Paciente/Datos Paciente en el parser estructurado.
    return true;
  });

  console.log(`${APPLY ? "APPLY" : "DRY-RUN"}: ${candidates.length} matches OCR de alta confianza`);

  let updated = 0;
  let createdPatients = 0;
  let linkedPatients = 0;

  for (const item of candidates) {
    const s = item.suggested.structured;
    const accountRows = await sql`
      SELECT id, email, full_name, rut, patient_id
      FROM customer_accounts
      WHERE id = ${item.accountId}
      LIMIT 1
    `;
    const account = accountRows[0];
    if (!account) {
      console.log(`SKIP ca=${item.accountId}: no existe cuenta`);
      continue;
    }
    if (account.rut) {
      console.log(`SKIP ca=${item.accountId}: ya tiene RUT ${account.rut}`);
      continue;
    }

    const existingPatient = await sql`
      SELECT id, rut, full_name
      FROM patients
      WHERE UPPER(REPLACE(REPLACE(COALESCE(rut,''), '.', ''), ' ', '')) = ${s.patientRut.replace(/\./g, "").replace(/\s/g, "").toUpperCase()}
      LIMIT 1
    `;

    if (!APPLY) {
      console.log(`WOULD ${existingPatient[0] ? "LINK" : "CREATE"} ca=${item.accountId} ${item.email} -> ${s.patientRut} | ${s.patientName} | doctor=${s.doctorName || "-"} ${s.doctorRut || ""}`);
      if (existingPatient[0]) linkedPatients++; else createdPatients++;
      updated++;
      continue;
    }

    let patientId = existingPatient[0]?.id;
    if (patientId) {
      await sql`
        UPDATE patients
           SET full_name = COALESCE(NULLIF(full_name, ''), ${s.patientName}),
               date_of_birth = COALESCE(date_of_birth, ${s.patientBirthDate || null}),
               email = COALESCE(email, ${item.email}),
               updated_at = CURRENT_TIMESTAMP
         WHERE id = ${patientId}
      `;
      linkedPatients++;
    } else {
      const inserted = await sql`
        INSERT INTO patients (rut, full_name, date_of_birth, email, membership_status, membership_started_at)
        VALUES (${s.patientRut}, ${s.patientName}, ${s.patientBirthDate || null}, ${item.email}, 'active', CURRENT_TIMESTAMP)
        RETURNING id
      `;
      patientId = inserted[0].id;
      createdPatients++;
    }

    await sql`
      UPDATE customer_accounts
         SET rut = ${s.patientRut},
             full_name = COALESCE(NULLIF(full_name, ''), ${displayName(item)}),
             patient_id = ${patientId},
             updated_at = CURRENT_TIMESTAMP
       WHERE id = ${item.accountId}
    `;
    updated++;
    console.log(`OK ca=${item.accountId} -> rut=${s.patientRut} patient=${patientId} doctor=${s.doctorName || "-"} ${s.doctorRut || ""}`);
  }

  console.log("\nResumen:", { updated, createdPatients, linkedPatients });
  await sql.end();
})().catch((e) => { console.error(e); process.exit(1); });
