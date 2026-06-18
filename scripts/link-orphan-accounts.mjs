#!/usr/bin/env node
/**
 * Vincula customer_accounts huérfanas (patient_id NULL) con patients existentes
 * por email o RUT normalizado.
 *
 * Uso:
 *   node scripts/link-orphan-accounts.mjs           # dry-run (default)
 *   node scripts/link-orphan-accounts.mjs --apply   # aplica UPDATE en DB
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

function normalizeRut(rut) {
  if (!rut) return "";
  return String(rut).replace(/\./g, "").replace(/-/g, "").replace(/\s/g, "").toUpperCase();
}

function normalizeEmail(email) {
  if (!email) return "";
  return String(email).trim().toLowerCase();
}

function matchBy(account, patient) {
  const accountRut = normalizeRut(account.account_rut);
  const patientRut = normalizeRut(patient.patient_rut);
  if (accountRut && patientRut && accountRut === patientRut) return "rut";

  const accountEmail = normalizeEmail(account.account_email);
  const patientEmail = normalizeEmail(patient.patient_email);
  if (accountEmail && patientEmail && accountEmail === patientEmail) return "email";

  return null;
}

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1 });

try {
  console.log("CULTISOFT · Link orphan customer_accounts → patients");
  console.log(`Fecha: ${new Date().toISOString()}`);
  console.log(`Modo: ${APPLY ? "APPLY" : "DRY-RUN"}\n`);

  const orphans = await sql`
    SELECT
      ca.id AS account_id,
      ca.email AS account_email,
      ca.rut AS account_rut,
      ca.full_name AS account_name
    FROM customer_accounts ca
    WHERE ca.patient_id IS NULL
    ORDER BY ca.id
  `;

  const patients = await sql`
    SELECT
      p.id AS patient_id,
      p.email AS patient_email,
      p.rut AS patient_rut,
      p.full_name AS patient_name,
      p.membership_status
    FROM patients p
    WHERE p.membership_status != 'deleted'
    ORDER BY p.id
  `;

  const linkedAccounts = await sql`
    SELECT id AS account_id, email AS account_email, patient_id
    FROM customer_accounts
    WHERE patient_id IS NOT NULL
  `;

  const accountsByPatientId = new Map();
  for (const row of linkedAccounts) {
    if (!accountsByPatientId.has(row.patient_id)) {
      accountsByPatientId.set(row.patient_id, []);
    }
    accountsByPatientId.get(row.patient_id).push(row);
  }

  const patientById = new Map(patients.map((p) => [p.patient_id, p]));

  const toLink = [];
  const skipped = [];

  for (const account of orphans) {
    const matches = patients
      .map((patient) => {
        const by = matchBy(
          { account_rut: account.account_rut, account_email: account.account_email },
          { patient_rut: patient.patient_rut, patient_email: patient.patient_email }
        );
        return by ? { ...patient, match_by: by } : null;
      })
      .filter(Boolean);

    if (matches.length === 0) {
      continue;
    }

    const patientIds = [...new Set(matches.map((m) => m.patient_id))];
    if (patientIds.length > 1) {
      skipped.push({
        account,
        reason: "ambiguous_patient_match",
        detail: `matches patients: ${patientIds.join(", ")}`,
      });
      continue;
    }

    const patient = patientById.get(patientIds[0]);
    const match = matches.find((m) => m.patient_id === patient.patient_id);
    const existing = accountsByPatientId.get(patient.patient_id) || [];

    if (existing.length > 0) {
      skipped.push({
        account,
        patient,
        match_by: match.match_by,
        reason: "patient_already_linked",
        detail: `patient #${patient.patient_id} already linked to account(s): ${existing.map((e) => `#${e.account_id} ${e.account_email}`).join("; ")}`,
      });
      continue;
    }

    toLink.push({
      account,
      patient,
      match_by: match.match_by,
    });

    accountsByPatientId.set(patient.patient_id, [
      {
        account_id: account.account_id,
        account_email: account.account_email,
        patient_id: patient.patient_id,
      },
    ]);
  }

  console.log(`Orphan accounts (patient_id NULL): ${orphans.length}`);
  console.log(`Would link / linked: ${toLink.length}`);
  console.log(`Skipped (conflict or ambiguous): ${skipped.length}\n`);

  if (toLink.length) {
    console.log(APPLY ? "Linking:" : "Would link:");
    for (const row of toLink) {
      const { account, patient, match_by } = row;
      console.log(
        `  account #${account.account_id} ${account.account_email} (${account.account_rut || "sin rut"})` +
          ` → patient #${patient.patient_id} ${patient.patient_name} (${patient.patient_rut || "sin rut"}) [${match_by}]`
      );
    }
    console.log("");
  } else {
    console.log("No linkable orphan accounts found.\n");
  }

  if (skipped.length) {
    console.log("Skipped:");
    for (const row of skipped) {
      const a = row.account;
      console.log(
        `  account #${a.account_id} ${a.account_email}: ${row.reason}` +
          (row.detail ? ` — ${row.detail}` : "")
      );
    }
    console.log("");
  }

  if (APPLY && toLink.length) {
    let linked = 0;
    for (const row of toLink) {
      const result = await sql`
        UPDATE customer_accounts
        SET patient_id = ${row.patient.patient_id},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${row.account.account_id}
          AND patient_id IS NULL
        RETURNING id
      `;
      if (result.length) linked++;
    }
    console.log(`✅ Applied: ${linked} account(s) linked`);
  } else if (!APPLY && toLink.length) {
    console.log("Dry-run complete. Re-run with --apply to persist links.");
  } else {
    console.log("✅ Done");
  }
} catch (e) {
  console.error("Error:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}