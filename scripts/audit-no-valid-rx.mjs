#!/usr/bin/env node
/**
 * Audita pacientes sin receta válida y los categoriza para acción.
 *
 * Receta válida:
 *   - prescriptions.status = 'active' AND expiry_date >= hoy
 *   - O cuenta web vinculada/matcheada con prescription_status = 'aprobada'
 *
 * Uso: node scripts/audit-no-valid-rx.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const TOP_N = 10;

const CATEGORIES = [
  "has_web_pending",
  "has_web_rechazada",
  "has_web_none",
  "no_web_account",
  "internal_expired_only",
];

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

function toIsoDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function pickPrimaryAccount(accounts, patientId) {
  if (!accounts.length) return null;
  const linked = accounts.filter((a) => a.patient_id === patientId);
  const pool = linked.length ? linked : accounts;
  return [...pool].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )[0];
}

function resolveWebRxStatus(accounts) {
  let status = null;
  for (const acc of accounts) {
    if (!status || acc.prescription_status !== "none") {
      status = acc.prescription_status;
    }
  }
  return status ?? "none";
}

function categorizePatient({ linkedAccounts, hadExpiredInternalRx }) {
  if (!linkedAccounts.length) {
    return hadExpiredInternalRx ? "internal_expired_only" : "no_web_account";
  }

  const statuses = new Set(linkedAccounts.map((a) => a.prescription_status));
  if (statuses.has("pending")) return "has_web_pending";
  if (statuses.has("rechazada")) return "has_web_rechazada";
  if (statuses.has("none") || statuses.has("expired")) return "has_web_none";

  return hadExpiredInternalRx ? "internal_expired_only" : "has_web_none";
}

function actionRecommended(category, webRxStatus) {
  switch (category) {
    case "has_web_pending":
      return "aprobar receta web";
    case "has_web_rechazada":
      return "pedir resubida";
    case "has_web_none":
      return webRxStatus === "expired" ? "pedir resubida" : "contactar paciente";
    case "no_web_account":
      return "crear cuenta web";
    case "internal_expired_only":
      return "renovar receta interna";
    default:
      return "contactar paciente";
  }
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function writeCsv(filePath, rows) {
  const headers = [
    "id",
    "name",
    "rut",
    "email",
    "phone",
    "category",
    "account_email",
    "web_rx_status",
    "action_recommended",
  ];
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  }
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1 });

try {
  const today = toIsoDateOnly(new Date());

  console.log("\n=== CultiSoft · Pacientes sin receta válida ===");
  console.log(`Fecha: ${today}`);

  const patients = await sql`
    SELECT id, full_name, rut, email, phone
    FROM patients
    WHERE membership_status IS DISTINCT FROM 'deleted'
    ORDER BY id
  `;

  const accounts = await sql`
    SELECT
      c.id,
      c.email,
      c.patient_id,
      c.rut,
      c.prescription_status,
      c.created_at,
      p.id AS matched_patient_id
    FROM customer_accounts c
    JOIN patients p ON p.membership_status IS DISTINCT FROM 'deleted'
      AND (
        c.patient_id = p.id
        OR (
          p.rut IS NOT NULL AND p.rut <> ''
          AND c.rut IS NOT NULL AND c.rut <> ''
          AND REPLACE(REPLACE(UPPER(c.rut), '.', ''), '-', '')
            = REPLACE(REPLACE(UPPER(p.rut), '.', ''), '-', '')
        )
        OR (
          p.email IS NOT NULL AND p.email <> ''
          AND LOWER(c.email) = LOWER(p.email)
        )
      )
    ORDER BY c.created_at ASC
  `;

  const accountsByPatient = new Map();
  for (const acc of accounts) {
    const pid = acc.matched_patient_id;
    if (!accountsByPatient.has(pid)) accountsByPatient.set(pid, []);
    accountsByPatient.get(pid).push(acc);
  }

  const validInternalRxRows = await sql`
    SELECT DISTINCT patient_id
    FROM prescriptions
    WHERE status = 'active'
      AND expiry_date >= CURRENT_DATE
  `;
  const validInternalSet = new Set(validInternalRxRows.map((r) => r.patient_id));

  const expiredInternalRxRows = await sql`
    SELECT DISTINCT patient_id
    FROM prescriptions
    WHERE expiry_date < CURRENT_DATE
      AND status NOT IN ('rejected', 'pending')
  `;
  const expiredInternalSet = new Set(expiredInternalRxRows.map((r) => r.patient_id));

  const noValidRxRows = [];
  let withValidRx = 0;

  for (const patient of patients) {
    const linked = accountsByPatient.get(patient.id) || [];
    const hasValidInternal = validInternalSet.has(patient.id);
    const hasWebApproved = linked.some((a) => a.prescription_status === "aprobada");

    if (hasValidInternal || hasWebApproved) {
      withValidRx++;
      continue;
    }

    const primary = pickPrimaryAccount(linked, patient.id);
    const webRxStatus = linked.length ? resolveWebRxStatus(linked) : "none";
    const category = categorizePatient({
      linkedAccounts: linked,
      hadExpiredInternalRx: expiredInternalSet.has(patient.id),
    });

    noValidRxRows.push({
      id: patient.id,
      name: patient.full_name,
      rut: patient.rut ?? "",
      email: patient.email ?? "",
      phone: patient.phone ?? "",
      category,
      account_email: primary?.email ?? "",
      web_rx_status: webRxStatus,
      action_recommended: actionRecommended(category, webRxStatus),
    });
  }

  const counts = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  for (const row of noValidRxRows) {
    counts[row.category] = (counts[row.category] || 0) + 1;
  }

  const outDir = path.join(root, "scripts", "out");
  fs.mkdirSync(outDir, { recursive: true });
  const csvPath = path.join(outDir, "patients-no-valid-rx.csv");
  writeCsv(csvPath, noValidRxRows);

  console.log(`\nPacientes activos (no deleted): ${patients.length}`);
  console.log(`Con receta válida: ${withValidRx}`);
  console.log(`Sin receta válida: ${noValidRxRows.length}`);
  console.log(`CSV: ${csvPath}`);

  console.log("\n--- Conteo por categoría ---");
  for (const category of CATEGORIES) {
    const n = counts[category] || 0;
    const pct = noValidRxRows.length
      ? ((n / noValidRxRows.length) * 100).toFixed(1)
      : "0.0";
    console.log(`  ${category}: ${n} (${pct}%)`);
  }

  console.log("\n--- Acciones recomendadas ---");
  const actionCounts = new Map();
  for (const row of noValidRxRows) {
    actionCounts.set(row.action_recommended, (actionCounts.get(row.action_recommended) || 0) + 1);
  }
  for (const [action, n] of [...actionCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${action}: ${n}`);
  }

  console.log(`\n--- Muestra (top ${TOP_N}) ---`);
  for (const row of noValidRxRows.slice(0, TOP_N)) {
    console.log(
      `  #${row.id} · ${row.name} · ${row.category} · web=${row.web_rx_status} · ${row.action_recommended}`
    );
  }

  console.log("");
} catch (e) {
  console.error("Error:", e.message);
  if (e.stack) console.error(e.stack);
  process.exitCode = 1;
} finally {
  await sql.end();
}