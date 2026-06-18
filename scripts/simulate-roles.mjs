#!/usr/bin/env node
/**
 * Simula acceso por rol y valida la ficha unificada de pacientes contra la DB.
 * Uso: node scripts/simulate-roles.mjs
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

const ROLES = ["superadmin", "admin", "doctor", "pharmacist", "dispenser"];
const NAV_ACCESS = {
  "/dashboard": ["admin", "superadmin", "doctor", "pharmacist", "dispenser"],
  "/patients": ["admin", "superadmin", "doctor", "pharmacist", "dispenser"],
  "/dispensations": ["admin", "superadmin", "pharmacist", "dispenser"],
  "/web-orders": ["admin", "superadmin", "pharmacist", "dispenser"],
  "/prescriptions": ["admin", "superadmin", "doctor", "pharmacist"],
  "/web-prescriptions": ["admin", "superadmin", "doctor", "pharmacist"],
  "/products": ["superadmin", "admin", "pharmacist"],
  "/inventory": ["superadmin", "admin", "pharmacist"],
  "/reports": ["admin", "superadmin"],
  "/ambassadors": ["admin", "superadmin"],
  "/admin": ["superadmin"],
};

function canAccess(role, href) {
  const allowed = NAV_ACCESS[href];
  if (!allowed) return true;
  return allowed.includes(role);
}

function normalizeRut(rut) {
  if (!rut) return null;
  return rut.replace(/\./g, "").replace(/-/g, "").toUpperCase();
}

async function loadPatientRecordSummary(sql, patientId) {
  const [patient] = await sql`SELECT * FROM patients WHERE id = ${patientId}`;
  if (!patient) return null;

  const patientRut = normalizeRut(patient.rut);
  const patientEmail = patient.email?.trim().toLowerCase() || null;

  const [rxCount] = await sql`
    SELECT COUNT(*)::int as c FROM prescriptions WHERE patient_id = ${patientId}`;
  const [dispCount] = await sql`
    SELECT COUNT(*)::int as c FROM dispensations WHERE patient_id = ${patientId}`;

  const rutNorm = patientRut || "";
  const emailNorm = patientEmail || "";
  const accounts = await sql`
    SELECT id, email, patient_id,
      CASE
        WHEN patient_id = ${patientId} THEN 'patient_id'
        WHEN ${rutNorm} <> '' AND REPLACE(REPLACE(UPPER(rut), '.', ''), '-', '') = ${rutNorm} THEN 'rut'
        WHEN ${emailNorm} <> '' AND LOWER(email) = ${emailNorm} THEN 'email'
        ELSE 'other'
      END as link_source
    FROM customer_accounts
    WHERE patient_id = ${patientId}
       OR (${rutNorm} <> '' AND REPLACE(REPLACE(UPPER(rut), '.', ''), '-', '') = ${rutNorm})
       OR (${emailNorm} <> '' AND LOWER(email) = ${emailNorm})`;

  const accountIds = [...new Set(accounts.map((a) => a.id))];
  let webOrderCount = 0;
  if (accountIds.length) {
    const [wo] = await sql`
      SELECT COUNT(*)::int as c FROM customer_orders
      WHERE customer_account_id = ANY(${accountIds})`;
    webOrderCount = wo.c;
  }

  const [auditCount] = await sql`
    SELECT COUNT(*)::int as c FROM audit_logs
    WHERE (entity_type = 'patient' AND entity_id = ${patientId})
       OR (entity_type = 'customer_account' AND entity_id = ANY(${accountIds.length ? accountIds : [0]}))`;

  return {
    patient: patient.full_name,
    rut: patient.rut,
    prescriptions: rxCount.c,
    dispensations: dispCount.c,
    accounts: accounts.length,
    accountsBySource: accounts.reduce((acc, a) => {
      acc[a.link_source] = (acc[a.link_source] || 0) + 1;
      return acc;
    }, {}),
    webOrders: webOrderCount,
    audits: auditCount.c,
  };
}

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1 });
let failed = 0;

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}
function fail(msg) {
  console.log(`  ✗ ${msg}`);
  failed++;
}

try {
  console.log("=== Matriz de permisos (sidebar) ===\n");
  for (const role of ROLES) {
    const routes = Object.keys(NAV_ACCESS).filter((r) => canAccess(role, r));
    console.log(`${role.padEnd(12)} → ${routes.join(", ")}`);
  }

  console.log("\n=== Staff por rol ===\n");
  const staffByRole = await sql`
    SELECT role, COUNT(*)::int as c FROM staff WHERE is_active = 1 GROUP BY role ORDER BY role`;
  for (const row of staffByRole) {
    console.log(`  ${row.role}: ${row.c} activo(s)`);
  }

  console.log("\n=== Simulación por rol ===\n");
  for (const role of ROLES) {
    const [sample] = await sql`
      SELECT id, email, full_name FROM staff WHERE role = ${role} AND is_active = 1 LIMIT 1`;
    console.log(`--- ${role} ${sample ? `(${sample.full_name} · ${sample.email})` : "(sin usuario activo)"} ---`);

    const canPatients = canAccess(role, "/patients");
    const canOps = canAccess(role, "/web-orders");
    const canRx = canAccess(role, "/prescriptions");
    const canReports = canAccess(role, "/reports");
    const canAdmin = role === "admin" || role === "superadmin";

    if (canPatients) ok("Puede ver ficha paciente (/patients)");
    else fail("No puede ver pacientes");

    if (canOps) ok("Puede gestionar pedidos y dispensaciones");
    else ok("Solo lectura en pedidos/dispensaciones desde ficha (sin nav)");

    if (canRx) ok("Puede ver/editar recetas");
    else ok("Sin acceso a recetas (esperado para dispenser)");

    if (canReports) ok("Puede ver reportes");
    else ok("Sin acceso a reportes (esperado)");

    if (canAdmin) ok("Puede editar datos paciente y vincular cuentas");
    else ok("Solo notas clínicas (sin editar perfil ni vincular)");

    console.log("");
  }

  console.log("=== Ficha unificada (muestra de pacientes) ===\n");
  const patients = await sql`
    SELECT id, full_name, rut FROM patients
    WHERE membership_status != 'deleted'
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 5`;

  if (!patients.length) {
    fail("No hay pacientes en la base de datos");
  } else {
    for (const p of patients) {
      const summary = await loadPatientRecordSummary(sql, p.id);
      if (!summary) {
        fail(`Paciente ${p.id} no encontrado`);
        continue;
      }
      console.log(
        `Paciente #${p.id} · ${summary.patient} (${summary.rut})`
      );
      console.log(
        `  recetas=${summary.prescriptions} dispensaciones=${summary.dispensations} cuentas=${summary.accounts} pedidos_web=${summary.webOrders} auditoría=${summary.audits}`
      );
      if (Object.keys(summary.accountsBySource).length) {
        console.log(`  cuentas por vínculo: ${JSON.stringify(summary.accountsBySource)}`);
      }
      ok(`Ficha cargable para paciente #${p.id}`);
      console.log("");
    }
  }

  console.log("=== Cuentas cliente (store) ===\n");
  const [custStats] = await sql`
    SELECT
      COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE patient_id IS NOT NULL)::int as linked,
      COUNT(*) FILTER (WHERE prescription_url IS NOT NULL)::int as with_rx,
      COUNT(*) FILTER (WHERE id_front_url IS NOT NULL)::int as with_id
    FROM customer_accounts`;
  console.log(`  Total cuentas: ${custStats.total}`);
  console.log(`  Vinculadas a paciente: ${custStats.linked}`);
  console.log(`  Con receta subida: ${custStats.with_rx}`);
  console.log(`  Con carnet: ${custStats.with_id}`);
  ok("Cuentas cliente consultables");

  console.log("\n=== Pedidos web ===\n");
  const [orderStats] = await sql`
    SELECT COUNT(*)::int as total,
      COUNT(DISTINCT customer_account_id)::int as accounts
    FROM customer_orders`;
  console.log(`  Total pedidos: ${orderStats.total} (${orderStats.accounts} cuentas distintas)`);
  ok("Pedidos web consultables");

  console.log(`\n${failed === 0 ? "✅" : "❌"} simulate-roles: ${failed} fallo(s)`);
  process.exitCode = failed > 0 ? 1 : 0;
} catch (e) {
  console.error("Error:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}