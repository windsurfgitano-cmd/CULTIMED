#!/usr/bin/env node
/**
 * Sincroniza email/phone de patients desde customer_accounts vinculadas
 * cuando el paciente no tiene esos datos pero la cuenta sí.
 *
 * Uso:
 *   node scripts/sync-patient-contact.mjs           # dry-run (default)
 *   node scripts/sync-patient-contact.mjs --apply   # aplica UPDATE en DB
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const APPLY = process.argv.includes("--apply");

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(path.join(root, "cultimed-store/package.json"));
const postgres = require("postgres");

const envPath = path.join(root, "cultimed-store", ".env.local");
if (!fs.existsSync(envPath)) {
  console.error("Missing cultimed-store/.env.local");
  process.exit(1);
}

for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^DATABASE_URL=(.+)$/);
  if (m) process.env.DATABASE_URL = m[1].replace(/^["']|["']$/g, "");
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

function isBlank(value) {
  return value == null || String(value).trim() === "";
}

function hasValue(value) {
  return !isBlank(value);
}

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1 });

try {
  console.log("CULTISOFT · Sync contacto paciente ← cuenta vinculada");
  console.log(`Fecha: ${new Date().toISOString()}`);
  console.log(`Modo: ${APPLY ? "APPLY" : "DRY-RUN"}\n`);

  const linked = await sql`
    SELECT
      p.id AS patient_id,
      p.full_name,
      p.email AS patient_email,
      p.phone AS patient_phone,
      c.id AS account_id,
      c.email AS account_email,
      c.phone AS account_phone,
      c.created_at
    FROM patients p
    JOIN customer_accounts c ON c.patient_id = p.id
    WHERE p.membership_status IS DISTINCT FROM 'deleted'
    ORDER BY p.id, c.created_at ASC
  `;

  const byPatient = new Map();
  for (const row of linked) {
    if (!byPatient.has(row.patient_id)) byPatient.set(row.patient_id, []);
    byPatient.get(row.patient_id).push(row);
  }

  const candidates = [];

  for (const [patientId, accounts] of byPatient) {
    const primary = accounts[0];
    const patientEmail = primary.patient_email;
    const patientPhone = primary.patient_phone;

    const needEmail = isBlank(patientEmail);
    const needPhone = isBlank(patientPhone);
    if (!needEmail && !needPhone) continue;

    let sourceEmail = null;
    let sourcePhone = null;
    let sourceAccountId = null;

    for (const acc of accounts) {
      if (needEmail && hasValue(acc.account_email) && !sourceEmail) {
        sourceEmail = String(acc.account_email).trim();
        sourceAccountId = acc.account_id;
      }
      if (needPhone && hasValue(acc.account_phone) && !sourcePhone) {
        sourcePhone = String(acc.account_phone).trim();
        if (!sourceAccountId) sourceAccountId = acc.account_id;
      }
      if ((!needEmail || sourceEmail) && (!needPhone || sourcePhone)) break;
    }

    const updates = {};
    if (needEmail && sourceEmail) updates.email = sourceEmail;
    if (needPhone && sourcePhone) updates.phone = sourcePhone;
    if (!Object.keys(updates).length) continue;

    candidates.push({
      patient_id: patientId,
      full_name: primary.full_name,
      account_id: sourceAccountId,
      patient_email: patientEmail ?? "",
      patient_phone: patientPhone ?? "",
      updates,
    });
  }

  let emailSyncs = 0;
  let phoneSyncs = 0;

  for (const row of candidates) {
    if (row.updates.email) emailSyncs++;
    if (row.updates.phone) phoneSyncs++;

    const parts = [];
    if (row.updates.email) {
      parts.push(`email: "${row.patient_email || "(vacío)"}" → "${row.updates.email}"`);
    }
    if (row.updates.phone) {
      parts.push(`phone: "${row.patient_phone || "(vacío)"}" → "${row.updates.phone}"`);
    }

    console.log(
      `  paciente #${row.patient_id} ${row.full_name} (cuenta #${row.account_id}): ${parts.join(", ")}`
    );

    if (APPLY) {
      if (row.updates.email && row.updates.phone) {
        await sql`
          UPDATE patients
          SET email = ${row.updates.email},
              phone = ${row.updates.phone},
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ${row.patient_id}
        `;
      } else if (row.updates.email) {
        await sql`
          UPDATE patients
          SET email = ${row.updates.email},
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ${row.patient_id}
        `;
      } else if (row.updates.phone) {
        await sql`
          UPDATE patients
          SET phone = ${row.updates.phone},
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ${row.patient_id}
        `;
      }
    }
  }

  console.log("\n--- Resumen ---");
  console.log(`  Pacientes que se sincronizarían: ${candidates.length}`);
  console.log(`  Campos email: ${emailSyncs}`);
  console.log(`  Campos phone: ${phoneSyncs}`);

  if (!APPLY && candidates.length) {
    console.log("\nEjecuta con --apply para aplicar los cambios.");
  } else if (APPLY) {
    console.log(`\nAplicados ${candidates.length} UPDATE(s).`);
  }
} catch (e) {
  console.error("Error:", e.message);
  if (e.stack) console.error(e.stack);
  process.exitCode = 1;
} finally {
  await sql.end();
}