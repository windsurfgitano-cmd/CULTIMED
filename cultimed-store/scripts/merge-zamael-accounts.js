// MERGE one-shot: unifica los registros duplicados de Zamael Daniel Scappaticcio Segura.
//
// Situación previa:
//   patient #67  zamasegura@hotmail.com   rut CID-52933081   1 receta + 1 dispensación  (historial real)
//   patient #107 alexandracruz94@gmail.com rut 19.733.969-1   vacío                     (RUT real, dup nuevo)
//   customer_account #67  zamasegura@hotmail.com  receta aprobada  patient_id NULL
//
// Resultado:
//   patient #67  → conserva historial, recibe RUT real 19.733.969-1, email alexandracruz94, nombre capitalizado
//   patient #107 → neutralizado (rut placeholder, membership pending, nombre marcado FUSIONADO)
//   customer_account #67 → email alexandracruz94@gmail.com, patient_id=67, password CULTISOS123
require("node:fs").readFileSync(".env.local", "utf8").split(/\r?\n/).forEach((l) => {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
});
const postgres = require("postgres");
const bcrypt = require("bcryptjs");

const FINAL_EMAIL = "alexandracruz94@gmail.com";
const FINAL_RUT = "19.733.969-1";
const FINAL_NAME = "Zamael Daniel Scappaticcio Segura";
const NEW_PASSWORD = "CULTISOS123";

(async () => {
  const sql = postgres(process.env.DATABASE_URL, { prepare: false, ssl: "require", max: 1 });

  // Snapshot ANTES
  console.log("══ ESTADO ANTES ══");
  const before = await sql`
    SELECT 'patient' as t, id, email, full_name, rut, membership_status::text as extra FROM patients WHERE id IN (67,107)
    UNION ALL
    SELECT 'customer' as t, id, email, full_name, COALESCE(rut,'—') as rut, prescription_status as extra FROM customer_accounts WHERE id=67
  `;
  before.forEach((r) => console.log(`  [${r.t}] #${r.id} ${r.email} | ${r.full_name} | rut=${r.rut} | ${r.extra}`));

  const hash = await bcrypt.hash(NEW_PASSWORD, 10);

  await sql.begin(async (tx) => {
    // 1. Neutralizar patient #107 PRIMERO (libera el RUT real + lo marca como fusionado)
    await tx`
      UPDATE patients
      SET rut = 'MERGED-107',
          full_name = '[FUSIONADO a paciente #67] zamael scappaticcio',
          email = 'merged-107.alexandracruz94@cultimed.invalid',
          membership_status = 'pending',
          notes = COALESCE(notes,'') || ' · Registro duplicado fusionado al paciente #67 el ' || CURRENT_DATE,
          updated_at = NOW()
      WHERE id = 107
    `;

    // 2. Patient #67 recibe el RUT real + nombre capitalizado + email final
    await tx`
      UPDATE patients
      SET rut = ${FINAL_RUT},
          full_name = ${FINAL_NAME},
          email = ${FINAL_EMAIL},
          updated_at = NOW()
      WHERE id = 67
    `;

    // 3. customer_account #67 → email final + vincula patient + nueva password
    await tx`
      UPDATE customer_accounts
      SET email = ${FINAL_EMAIL},
          patient_id = 67,
          password_hash = ${hash},
          full_name = ${FINAL_NAME},
          rut = ${FINAL_RUT},
          updated_at = NOW()
      WHERE id = 67
    `;
  });

  // Snapshot DESPUÉS
  console.log("\n══ ESTADO DESPUÉS ══");
  const after = await sql`
    SELECT 'patient' as t, id, email, full_name, rut, membership_status::text as extra FROM patients WHERE id IN (67,107)
    UNION ALL
    SELECT 'customer' as t, id, email, full_name, COALESCE(rut,'—') as rut, prescription_status as extra FROM customer_accounts WHERE id=67
  `;
  after.forEach((r) => console.log(`  [${r.t}] #${r.id} ${r.email} | ${r.full_name} | rut=${r.rut} | ${r.extra}`));

  // Verificación: historial sigue en patient 67
  const rx = await sql`SELECT COUNT(*)::int n FROM prescriptions WHERE patient_id=67`;
  const disp = await sql`SELECT COUNT(*)::int n FROM dispensations WHERE patient_id=67`;
  console.log(`\n✓ Historial conservado en patient #67: ${rx[0].n} receta(s) + ${disp[0].n} dispensación(es)`);
  console.log(`✓ Login final: ${FINAL_EMAIL} / ${NEW_PASSWORD}`);
  console.log(`✓ customer_account #67 vinculado a patient #67`);

  await sql.end();
})().catch((e) => { console.error("✗ ERROR:", e.message); process.exit(1); });
