#!/usr/bin/env node
/**
 * Auditoría de pacientes, cuentas cliente y staff en la DB de producción.
 * Uso: node scripts/audit-users-db.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

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

function section(title) {
  console.log(`\n=== ${title} ===\n`);
}

function kv(label, value, indent = 0) {
  const pad = "  ".repeat(indent);
  console.log(`${pad}${label}: ${value}`);
}

function rows(title, list, formatter) {
  console.log(title);
  if (!list.length) {
    console.log("  (ninguno)");
    return;
  }
  for (const row of list) console.log(`  ${formatter(row)}`);
}

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1 });

try {
  console.log("CULTISOFT · Auditoría pacientes / cuentas / staff");
  console.log(`Fecha: ${new Date().toISOString()}`);

  // ── PATIENTS ──────────────────────────────────────────────────────────────
  section("PATIENTS");

  const [patientTotals] = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE membership_status = 'deleted')::int AS deleted,
      COUNT(*) FILTER (WHERE email IS NULL OR TRIM(email) = '')::int AS missing_email,
      COUNT(*) FILTER (WHERE phone IS NULL OR TRIM(phone) = '')::int AS missing_phone,
      COUNT(*) FILTER (WHERE date_of_birth IS NULL)::int AS missing_date_of_birth,
      COUNT(*) FILTER (WHERE city IS NULL OR TRIM(city) = '')::int AS missing_city
    FROM patients`;

  kv("Total", patientTotals.total);
  kv("Deleted (membership_status=deleted)", patientTotals.deleted);
  kv("Missing email", patientTotals.missing_email);
  kv("Missing phone", patientTotals.missing_phone);
  kv("Missing date_of_birth", patientTotals.missing_date_of_birth);
  kv("Missing city", patientTotals.missing_city);

  const patientsByStatus = await sql`
    SELECT membership_status, COUNT(*)::int AS c
    FROM patients
    GROUP BY membership_status
    ORDER BY c DESC, membership_status`;

  rows("Por membership_status:", patientsByStatus, (r) => `${r.membership_status}: ${r.c}`);

  // ── CUSTOMER_ACCOUNTS ─────────────────────────────────────────────────────
  section("CUSTOMER_ACCOUNTS");

  const [custTotals] = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE patient_id IS NOT NULL)::int AS linked,
      COUNT(*) FILTER (WHERE patient_id IS NULL)::int AS unlinked,
      COUNT(*) FILTER (WHERE rut IS NULL OR TRIM(rut) = '')::int AS missing_rut,
      COUNT(*) FILTER (WHERE prescription_ocr_data IS NOT NULL)::int AS with_ocr,
      COUNT(*) FILTER (WHERE prescription_ocr_data IS NULL)::int AS without_ocr,
      COUNT(*) FILTER (WHERE is_ambassador = 1)::int AS ambassadors
    FROM customer_accounts`;

  kv("Total", custTotals.total);
  kv("Linked (patient_id set)", custTotals.linked);
  kv("Unlinked (patient_id NULL)", custTotals.unlinked);
  kv("Missing RUT", custTotals.missing_rut);
  kv("With OCR data", custTotals.with_ocr);
  kv("Without OCR data", custTotals.without_ocr);
  kv("Ambassadors (is_ambassador=1)", custTotals.ambassadors);

  const custByRxStatus = await sql`
    SELECT prescription_status, COUNT(*)::int AS c
    FROM customer_accounts
    GROUP BY prescription_status
    ORDER BY c DESC, prescription_status`;

  rows("Por prescription_status:", custByRxStatus, (r) => `${r.prescription_status}: ${r.c}`);

  const [docMissing] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE prescription_url IS NULL OR TRIM(prescription_url) = '')::int AS missing_prescription,
      COUNT(*) FILTER (WHERE id_front_url IS NULL OR TRIM(id_front_url) = '')::int AS missing_id_front,
      COUNT(*) FILTER (WHERE id_back_url IS NULL OR TRIM(id_back_url) = '')::int AS missing_id_back,
      COUNT(*) FILTER (WHERE criminal_record_url IS NULL OR TRIM(criminal_record_url) = '')::int AS missing_criminal_record,
      COUNT(*) FILTER (WHERE rights_assignment_url IS NULL OR TRIM(rights_assignment_url) = '')::int AS missing_rights_assignment
    FROM customer_accounts`;

  console.log("Documentos faltantes (por tipo):");
  kv("prescription_url", docMissing.missing_prescription, 1);
  kv("id_front_url", docMissing.missing_id_front, 1);
  kv("id_back_url", docMissing.missing_id_back, 1);
  kv("criminal_record_url", docMissing.missing_criminal_record, 1);
  kv("rights_assignment_url", docMissing.missing_rights_assignment, 1);

  // ── CROSS-MATCH ───────────────────────────────────────────────────────────
  section("CROSS-MATCH");

  const matchableUnlinked = await sql`
    SELECT
      ca.id AS account_id,
      ca.email AS account_email,
      ca.rut AS account_rut,
      p.id AS patient_id,
      p.full_name AS patient_name,
      p.rut AS patient_rut,
      CASE
        WHEN REPLACE(REPLACE(UPPER(COALESCE(ca.rut, '')), '.', ''), '-', '') <> ''
          AND REPLACE(REPLACE(UPPER(COALESCE(ca.rut, '')), '.', ''), '-', '')
            = REPLACE(REPLACE(UPPER(p.rut), '.', ''), '-', '')
          THEN 'rut'
        WHEN LOWER(TRIM(COALESCE(ca.email, ''))) <> ''
          AND LOWER(TRIM(ca.email)) = LOWER(TRIM(p.email))
          THEN 'email'
        ELSE 'other'
      END AS match_by
    FROM customer_accounts ca
    JOIN patients p ON (
      (
        REPLACE(REPLACE(UPPER(COALESCE(ca.rut, '')), '.', ''), '-', '') <> ''
        AND REPLACE(REPLACE(UPPER(COALESCE(ca.rut, '')), '.', ''), '-', '')
          = REPLACE(REPLACE(UPPER(p.rut), '.', ''), '-', '')
      )
      OR (
        LOWER(TRIM(COALESCE(ca.email, ''))) <> ''
        AND LOWER(TRIM(ca.email)) = LOWER(TRIM(p.email))
      )
    )
    WHERE ca.patient_id IS NULL
      AND p.membership_status != 'deleted'
    ORDER BY ca.id
    LIMIT 10`;

  rows(
    `Cuentas vinculables por RUT/email pero sin patient_id (top ${matchableUnlinked.length}):`,
    matchableUnlinked,
    (r) =>
      `#${r.account_id} ${r.account_email} (${r.account_rut || "sin rut"}) → paciente #${r.patient_id} ${r.patient_name} (${r.patient_rut}) [${r.match_by}]`
  );

  const [matchableUnlinkedCount] = await sql`
    SELECT COUNT(*)::int AS c
    FROM customer_accounts ca
    WHERE ca.patient_id IS NULL
      AND EXISTS (
        SELECT 1 FROM patients p
        WHERE p.membership_status != 'deleted'
          AND (
            (
              REPLACE(REPLACE(UPPER(COALESCE(ca.rut, '')), '.', ''), '-', '') <> ''
              AND REPLACE(REPLACE(UPPER(COALESCE(ca.rut, '')), '.', ''), '-', '')
                = REPLACE(REPLACE(UPPER(p.rut), '.', ''), '-', '')
            )
            OR (
              LOWER(TRIM(COALESCE(ca.email, ''))) <> ''
              AND LOWER(TRIM(ca.email)) = LOWER(TRIM(p.email))
            )
          )
      )`;
  kv("Total cuentas vinculables sin link", matchableUnlinkedCount.c);

  const patientsMultiLinked = await sql`
    SELECT patient_id, COUNT(*)::int AS account_count,
      STRING_AGG(id::text, ', ' ORDER BY id) AS account_ids
    FROM customer_accounts
    WHERE patient_id IS NOT NULL
    GROUP BY patient_id
    HAVING COUNT(*) > 1
    ORDER BY account_count DESC, patient_id
    LIMIT 20`;

  rows(
    `Pacientes con múltiples cuentas (por patient_id, top ${patientsMultiLinked.length}):`,
    patientsMultiLinked,
    (r) => `paciente #${r.patient_id}: ${r.account_count} cuentas [${r.account_ids}]`
  );

  const [patientsMultiLinkedCount] = await sql`
    SELECT COUNT(*)::int AS c FROM (
      SELECT patient_id
      FROM customer_accounts
      WHERE patient_id IS NOT NULL
      GROUP BY patient_id
      HAVING COUNT(*) > 1
    ) t`;
  kv("Total pacientes con >1 cuenta (patient_id)", patientsMultiLinkedCount.c);

  const patientsWithUnlinkedAccount = await sql`
    SELECT DISTINCT
      p.id AS patient_id,
      p.full_name,
      p.rut,
      p.email,
      ca.id AS account_id,
      ca.email AS account_email,
      CASE
        WHEN REPLACE(REPLACE(UPPER(COALESCE(ca.rut, '')), '.', ''), '-', '') <> ''
          AND REPLACE(REPLACE(UPPER(COALESCE(ca.rut, '')), '.', ''), '-', '')
            = REPLACE(REPLACE(UPPER(p.rut), '.', ''), '-', '')
          THEN 'rut'
        WHEN LOWER(TRIM(COALESCE(ca.email, ''))) <> ''
          AND LOWER(TRIM(ca.email)) = LOWER(TRIM(p.email))
          THEN 'email'
        ELSE 'other'
      END AS match_by
    FROM patients p
    JOIN customer_accounts ca ON (
      (
        REPLACE(REPLACE(UPPER(COALESCE(ca.rut, '')), '.', ''), '-', '') <> ''
        AND REPLACE(REPLACE(UPPER(COALESCE(ca.rut, '')), '.', ''), '-', '')
          = REPLACE(REPLACE(UPPER(p.rut), '.', ''), '-', '')
      )
      OR (
        LOWER(TRIM(COALESCE(ca.email, ''))) <> ''
        AND LOWER(TRIM(ca.email)) = LOWER(TRIM(p.email))
      )
    )
    WHERE ca.patient_id IS NULL
      AND p.membership_status != 'deleted'
    ORDER BY p.id, ca.id
    LIMIT 20`;

  rows(
    `Pacientes con cuenta coincidente pero sin patient_id en la cuenta (top ${patientsWithUnlinkedAccount.length}):`,
    patientsWithUnlinkedAccount,
    (r) =>
      `paciente #${r.patient_id} ${r.full_name} → cuenta #${r.account_id} ${r.account_email} [${r.match_by}]`
  );

  const [patientsWithUnlinkedCount] = await sql`
    SELECT COUNT(DISTINCT p.id)::int AS c
    FROM patients p
    JOIN customer_accounts ca ON (
      (
        REPLACE(REPLACE(UPPER(COALESCE(ca.rut, '')), '.', ''), '-', '') <> ''
        AND REPLACE(REPLACE(UPPER(COALESCE(ca.rut, '')), '.', ''), '-', '')
          = REPLACE(REPLACE(UPPER(p.rut), '.', ''), '-', '')
      )
      OR (
        LOWER(TRIM(COALESCE(ca.email, ''))) <> ''
        AND LOWER(TRIM(ca.email)) = LOWER(TRIM(p.email))
      )
    )
    WHERE ca.patient_id IS NULL
      AND p.membership_status != 'deleted'`;
  kv("Total pacientes con cuenta sin link", patientsWithUnlinkedCount.c);

  // ── STAFF ─────────────────────────────────────────────────────────────────
  section("STAFF");

  const staffByRole = await sql`
    SELECT
      role,
      COUNT(*) FILTER (WHERE is_active = 1)::int AS active,
      COUNT(*) FILTER (WHERE is_active != 1)::int AS inactive,
      COUNT(*)::int AS total
    FROM staff
    GROUP BY role
    ORDER BY role`;

  const [staffTotals] = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE is_active = 1)::int AS active,
      COUNT(*) FILTER (WHERE is_active != 1)::int AS inactive
    FROM staff`;

  kv("Total", staffTotals.total);
  kv("Active", staffTotals.active);
  kv("Inactive", staffTotals.inactive);

  rows("Por rol:", staffByRole, (r) => `${r.role}: ${r.active} activo, ${r.inactive} inactivo (${r.total} total)`);

  console.log("\n✅ Auditoría completada");
} catch (e) {
  console.error("Error:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}