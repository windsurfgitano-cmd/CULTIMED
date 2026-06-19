#!/usr/bin/env node
/**
 * Marca pacientes sin receta válida (no_valid_rx) como membership_status='pending'
 * cuando no tienen cuenta web o su receta web está rechazada.
 *
 * NO toca pacientes con receta web aprobada ni cuentas con receta web pending.
 *
 * Uso:
 *   node scripts/flag-patients-pending.mjs           # dry-run (default)
 *   node scripts/flag-patients-pending.mjs --apply   # aplica UPDATE + audit_logs
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

function matchAccountToPatient(account, patient) {
  if (account.patient_id === patient.id) return true;
  const accountRut = normalizeRut(account.rut);
  const patientRut = normalizeRut(patient.rut);
  if (accountRut && patientRut && accountRut === patientRut) return true;
  const accountEmail = normalizeEmail(account.email);
  const patientEmail = normalizeEmail(patient.email);
  if (accountEmail && patientEmail && accountEmail === patientEmail) return true;
  return false;
}

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1 });

async function resolveAuditStaffId() {
  const [row] = await sql`
    SELECT id FROM staff
    WHERE id = 1 AND role = 'superadmin'
    LIMIT 1
  `;
  return row?.id ?? null;
}

try {
  console.log("CULTISOFT · Flag no_valid_rx patients → membership_status=pending");
  console.log(`Fecha: ${new Date().toISOString()}`);
  console.log(`Modo: ${APPLY ? "APPLY" : "DRY-RUN"}\n`);

  const patients = await sql`
    SELECT id, full_name, rut, email, membership_status
    FROM patients
    WHERE membership_status IS DISTINCT FROM 'deleted'
    ORDER BY id
  `;

  const accounts = await sql`
    SELECT id, email, patient_id, rut, prescription_status
    FROM customer_accounts
    ORDER BY id
  `;

  const patientsWithActiveInternalRx = await sql`
    SELECT DISTINCT patient_id
    FROM prescriptions
    WHERE status = 'active'
  `;
  const activeInternalSet = new Set(
    patientsWithActiveInternalRx.map((r) => Number(r.patient_id))
  );

  const accountsByPatient = new Map();
  for (const patient of patients) {
    const linked = accounts.filter((a) => matchAccountToPatient(a, patient));
    if (linked.length) accountsByPatient.set(patient.id, linked);
  }

  const candidates = [];
  const skipped = [];

  for (const patient of patients) {
    if (activeInternalSet.has(Number(patient.id))) continue;

    const linked = accountsByPatient.get(patient.id) || [];
    const hasApprovedWeb = linked.some((a) => a.prescription_status === "aprobada");
    if (hasApprovedWeb) continue;

    const hasRechazadaWeb = linked.some((a) => a.prescription_status === "rechazada");
    const noWebAccount = linked.length === 0;

    if (!noWebAccount && !hasRechazadaWeb) continue;

    const webStatus =
      linked.find((a) => a.prescription_status !== "none")?.prescription_status ?? "none";

    const entry = {
      id: patient.id,
      full_name: patient.full_name,
      rut: patient.rut,
      membership_status: patient.membership_status,
      web_rx_status: webStatus,
      linked_accounts: linked.length,
      reason: noWebAccount ? "no_web_account" : "web_rechazada",
    };

    if (patient.membership_status === "pending") {
      skipped.push({ ...entry, skip_reason: "already_pending" });
      continue;
    }

    if (patient.membership_status === "suspended") {
      skipped.push({ ...entry, skip_reason: "suspended" });
      continue;
    }

    candidates.push(entry);
  }

  console.log(`Pacientes no_valid_rx (sin rx interna activa ni web aprobada): screened`);
  console.log(`Candidatos a pending (no cuenta web o web rechazada): ${candidates.length}`);
  console.log(`Omitidos (ya pending/suspended): ${skipped.length}\n`);

  if (candidates.length) {
    console.log(APPLY ? "Marcando pending:" : "Marcaría pending:");
    for (const row of candidates) {
      console.log(
        `  #${row.id} · ${row.full_name} · ${row.rut ?? "—"} · ` +
          `status=${row.membership_status} → pending · ${row.reason} · web_rx=${row.web_rx_status}`
      );
    }
    console.log("");
  } else {
    console.log("No hay pacientes para marcar.\n");
  }

  if (skipped.length) {
    console.log("Omitidos:");
    for (const row of skipped.slice(0, 10)) {
      console.log(
        `  #${row.id} · ${row.full_name} · ${row.skip_reason} · web_rx=${row.web_rx_status}`
      );
    }
    if (skipped.length > 10) {
      console.log(`  ... +${skipped.length - 10} más`);
    }
    console.log("");
  }

  if (!APPLY) {
    if (candidates.length) {
      console.log("Dry-run complete. Re-run with --apply to set pending and write audit_logs.");
    } else {
      console.log("✅ Done");
    }
    process.exit(0);
  }

  const staffId = await resolveAuditStaffId();
  console.log(`Audit staff_id: ${staffId ?? "NULL"}\n`);

  let updated = 0;
  for (const row of candidates) {
    const result = await sql`
      UPDATE patients
      SET membership_status = 'pending',
          updated_at = NOW()
      WHERE id = ${row.id}
        AND membership_status NOT IN ('deleted', 'pending', 'suspended')
      RETURNING id
    `;

    if (!result.length) continue;

    await sql`
      INSERT INTO audit_logs (staff_id, action, entity_type, entity_id, details)
      VALUES (
        ${staffId},
        'patient_flagged_pending_no_valid_rx',
        'patient',
        ${row.id},
        ${sql.json({
          previous_status: row.membership_status,
          new_status: "pending",
          reason: row.reason,
          web_rx_status: row.web_rx_status,
          linked_accounts: row.linked_accounts,
          script: "flag-patients-pending.mjs",
        })}
      )
    `;

    updated++;
  }

  console.log(`✅ Applied: ${updated} patient(s) marked pending`);
} catch (e) {
  console.error("Error:", e.message);
  if (e.stack) console.error(e.stack);
  process.exitCode = 1;
} finally {
  await sql.end();
}