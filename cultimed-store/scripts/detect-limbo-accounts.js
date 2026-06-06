// Detecta cuentas en "limbo" en customer_accounts
// Limbo = sin password_hash, sin RUT, sin patient_id, receta no aprobada, email sin activar, etc.
require("fs").readFileSync(".env.local", "utf8").split(/\r?\n/).forEach((line) => {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
});
const postgres = require("postgres");
const sql = postgres(process.env.DATABASE_URL, { prepare: false, ssl: "require", max: 1 });

(async () => {
  console.log("=== CUENTAS EN LIMBO ===\n");

  // 1. Sin password_hash (migraciones Shopify, invitadas sin activar)
  const noPassword = await sql`
    SELECT id, email, full_name, rut, phone, prescription_status,
           password_hash IS NULL as no_password,
           patient_id IS NULL as no_patient,
           prescription_status,
           created_at
    FROM customer_accounts
    WHERE password_hash IS NULL OR password_hash = ''
    ORDER BY created_at DESC
  `;
  console.log(`\n1. SIN PASSWORD_HASH (${noPassword.length}):`);
  noPassword.forEach(r => console.log(`  id=${r.id} | ${r.email} | ${r.full_name} | RUT:${r.rut || "SIN"} | receta:${r.prescription_status} | patient:${r.patient_id || "NULL"} | ${r.created_at}`));

  // 2. Con password pero SIN RUT
  const noRut = await sql`
    SELECT id, email, full_name, rut, phone, prescription_status,
           patient_id IS NULL as no_patient,
           created_at
    FROM customer_accounts
    WHERE (rut IS NULL OR rut = '') AND password_hash IS NOT NULL
    ORDER BY created_at DESC
  `;
  console.log(`\n2. CON PASSWORD PERO SIN RUT (${noRut.length}):`);
  noRut.forEach(r => console.log(`  id=${r.id} | ${r.email} | ${r.full_name} | receta:${r.prescription_status} | patient:${r.patient_id || "NULL"}`));

  // 3. Con RUT pero SIN patient_id (no vinculado a ficha clínica)
  const rutNoPatient = await sql`
    SELECT id, email, full_name, rut, phone, prescription_status,
           patient_id IS NULL as no_patient,
           created_at
    FROM customer_accounts
    WHERE rut IS NOT NULL AND rut != '' AND patient_id IS NULL
    ORDER BY created_at DESC
  `;
  console.log(`\n3. CON RUT PERO SIN patient_id (${rutNoPatient.length}):`);
  rutNoPatient.forEach(r => console.log(`  id=${r.id} | ${r.email} | ${r.full_name} | RUT:${r.rut} | receta:${r.prescription_status}`));

  // 4. Con patient_id pero datos incompletos en patients
  const patientIncomplete = await sql`
    SELECT ca.id, ca.email, ca.full_name, ca.rut, ca.patient_id,
           p.date_of_birth, p.gender, p.address, p.city,
           p.emergency_contact_name, p.emergency_contact_phone
    FROM customer_accounts ca
    JOIN patients p ON p.id = ca.patient_id
    WHERE p.date_of_birth IS NULL
       OR p.gender IS NULL
       OR p.address IS NULL
       OR p.city IS NULL
       OR p.emergency_contact_name IS NULL
    ORDER BY ca.created_at DESC
  `;
  console.log(`\n4. PACIENTE VINCULADO PERO DATOS INCOMPLETOS (${patientIncomplete.length}):`);
  patientIncomplete.forEach(r => {
    const miss = [];
    if (!r.date_of_birth) miss.push("nac");
    if (!r.gender) miss.push("género");
    if (!r.address) miss.push("dir");
    if (!r.city) miss.push("ciudad");
    if (!r.emergency_contact_name) miss.push("contacto_emerg");
    console.log(`  id=${r.id} | ${r.email} | patient=${r.patient_id} | faltan: ${miss.join(", ")}`);
  });

  // 5. Receta aprobada pero SIN dirección para despacho
  const approvedNoAddr = await sql`
    SELECT ca.id, ca.email, ca.full_name, ca.rut, ca.patient_id,
           p.address, p.city
    FROM customer_accounts ca
    LEFT JOIN patients p ON p.id = ca.patient_id
    WHERE ca.prescription_status = 'aprobada'
      AND (p.address IS NULL OR p.city IS NULL)
    ORDER BY ca.created_at DESC
  `;
  console.log(`\n5. RECETA APROBADA PERO SIN DIRECCION (${approvedNoAddr.length}):`);
  approvedNoAddr.forEach(r => console.log(`  id=${r.id} | ${r.email} | patient=${r.patient_id} | address:${r.address || "NULL"} | city:${r.city || "NULL"}`));

  // 6. Cuentas duplicadas por email (case-insensitive)
  const dupEmail = await sql`
    SELECT LOWER(email) as email, COUNT(*) as cnt, STRING_AGG(id::text, ',') as ids
    FROM customer_accounts
    GROUP BY LOWER(email)
    HAVING COUNT(*) > 1
  `;
  console.log(`\n6. EMAILS DUPLICADOS (${dupEmail.length}):`);
  dupEmail.forEach(r => console.log(`  ${r.email} -> ids: ${r.ids}`));

  // 7. Cuentas duplicadas por RUT (normalizado)
  const dupRut = await sql`
    SELECT UPPER(REPLACE(REPLACE(COALESCE(rut,''), '.', ''), ' ', '')) as rut_norm, COUNT(*) as cnt, STRING_AGG(id::text, ',') as ids
    FROM customer_accounts
    WHERE rut IS NOT NULL AND rut != ''
    GROUP BY rut_norm
    HAVING COUNT(*) > 1
  `;
  console.log(`\n7. RUTS DUPLICADOS (${dupRut.length}):`);
  dupRut.forEach(r => console.log(`  ${r.rut_norm} -> ids: ${r.ids}`));

  // Resumen totales
  const totals = await sql`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE password_hash IS NULL OR password_hash = '') as sin_password,
      COUNT(*) FILTER (WHERE rut IS NULL OR rut = '') as sin_rut,
      COUNT(*) FILTER (WHERE patient_id IS NULL) as sin_patient,
      COUNT(*) FILTER (WHERE prescription_status = 'aprobada') as receta_aprobada,
      COUNT(*) FILTER (WHERE prescription_status = 'pending') as receta_pendiente,
      COUNT(*) FILTER (WHERE prescription_status = 'rechazada') as receta_rechazada,
      COUNT(*) FILTER (WHERE prescription_status = 'none') as sin_receta
    FROM customer_accounts
  `;
  console.log(`\n=== RESUMEN GENERAL ===`);
  console.log(totals[0]);

  await sql.end();
})().catch((e) => { console.error(e.message); process.exit(1); });