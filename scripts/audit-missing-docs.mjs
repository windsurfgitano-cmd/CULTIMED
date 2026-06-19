#!/usr/bin/env node
/**
 * Audita documentos críticos faltantes en cuentas vinculadas (patient_id set).
 * Uso: node scripts/audit-missing-docs.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const DOC_FIELDS = [
  "prescription_url",
  "id_front_url",
  "id_back_url",
  "criminal_record_url",
  "rights_assignment_url",
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

function hasUrl(value) {
  return Boolean(value && String(value).trim());
}

function csvEscape(value) {
  const s = value == null ? "" : String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function missingFields(row) {
  const missing = [];
  for (const field of DOC_FIELDS) {
    if (!hasUrl(row[field])) missing.push(field);
  }
  return missing;
}

function completenessPct(missing) {
  const present = DOC_FIELDS.length - missing.length;
  return Math.round((present / DOC_FIELDS.length) * 100);
}

function priority(missing) {
  return missing.includes("prescription_url") || missing.includes("id_front_url")
    ? "critical"
    : "normal";
}

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1 });

try {
  console.log("CULTISOFT · Auditoría documentos críticos (cuentas vinculadas)");
  console.log(`Fecha: ${new Date().toISOString()}\n`);

  const rows = await sql`
    SELECT
      p.id AS patient_id,
      p.full_name AS name,
      p.email,
      p.phone,
      c.id AS account_id,
      c.prescription_url,
      c.id_front_url,
      c.id_back_url,
      c.criminal_record_url,
      c.rights_assignment_url
    FROM customer_accounts c
    JOIN patients p ON p.id = c.patient_id
    WHERE c.patient_id IS NOT NULL
      AND p.membership_status IS DISTINCT FROM 'deleted'
    ORDER BY p.id, c.id
  `;

  console.log(`Cuentas vinculadas (patient_id set, paciente activo): ${rows.length}`);

  const missingCounts = Object.fromEntries(DOC_FIELDS.map((f) => [f, 0]));
  const reportRows = [];

  for (const row of rows) {
    const missing = missingFields(row);
    for (const field of missing) missingCounts[field]++;

    if (!missing.length) continue;

    reportRows.push({
      patient_id: row.patient_id,
      name: row.name,
      email: row.email ?? "",
      phone: row.phone ?? "",
      account_id: row.account_id,
      missing_fields: missing.join(","),
      completeness_pct: completenessPct(missing),
      priority: priority(missing),
    });
  }

  console.log("\n--- Faltantes por tipo de documento ---");
  for (const field of DOC_FIELDS) {
    console.log(`  ${field}: ${missingCounts[field]}`);
  }

  const criticalCount = reportRows.filter((r) => r.priority === "critical").length;
  console.log(`\nCuentas con al menos un doc faltante: ${reportRows.length}`);
  console.log(`Prioridad critical (sin prescription_url o id_front_url): ${criticalCount}`);

  const outDir = path.join(root, "scripts", "out");
  fs.mkdirSync(outDir, { recursive: true });
  const csvPath = path.join(outDir, "patients-missing-docs.csv");

  const header =
    "patient_id,name,email,phone,account_id,missing_fields,completeness_pct,priority";
  const lines = reportRows.map((r) =>
    [
      r.patient_id,
      csvEscape(r.name),
      csvEscape(r.email),
      csvEscape(r.phone),
      r.account_id,
      csvEscape(r.missing_fields),
      r.completeness_pct,
      r.priority,
    ].join(",")
  );

  fs.writeFileSync(csvPath, [header, ...lines].join("\n") + (lines.length ? "\n" : ""), "utf8");
  console.log(`\nCSV: ${csvPath} (${reportRows.length} filas)`);
} catch (e) {
  console.error("Error:", e.message);
  if (e.stack) console.error(e.stack);
  process.exitCode = 1;
} finally {
  await sql.end();
}