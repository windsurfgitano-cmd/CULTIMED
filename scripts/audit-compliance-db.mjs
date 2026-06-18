#!/usr/bin/env node
/**
 * Audit compliance violations across all non-deleted patients (production DB).
 * Uso: node scripts/audit-compliance-db.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const MONTHLY_GRAM_THRESHOLD = 30;
const RECENT_ORDER_DAYS = 90;
const TOP_N = 15;

const GRAM_RE = /(\d+(?:[.,]\d+)?)\s*g\b/i;
const ML_RE = /(\d+(?:[.,]\d+)?)\s*ml\b/i;

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

function monthKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function parseAmount(raw) {
  const n = parseFloat(String(raw).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function combinedText(presentation, name) {
  return `${presentation || ""} ${name || ""}`.trim();
}

function isFlowerCategory(presentation, name) {
  const text = combinedText(presentation, name).toLowerCase();
  return (
    /\bflor(es)?\b/.test(text) ||
    /\bflower\b/.test(text) ||
    /\bcannabis\b/.test(text) ||
    /\bflores\b/.test(text)
  );
}

function isOilOrMl(presentation, name) {
  const text = combinedText(presentation, name).toLowerCase();
  return /\bml\b/.test(text) || /\baceite\b/.test(text) || /\boil\b/.test(text);
}

function parseGramsPerUnit(presentation, name, quantity) {
  const text = combinedText(presentation, name);
  const qty = Math.max(0, Number(quantity) || 0);
  if (qty === 0) return 0;

  const gramMatch = text.match(GRAM_RE);
  if (gramMatch) return parseAmount(gramMatch[1]) * qty;

  const mlMatch = text.match(ML_RE);
  if (mlMatch) return parseAmount(mlMatch[1]) * qty;

  if (isOilOrMl(presentation, name)) return qty;
  if (isFlowerCategory(presentation, name)) return qty;
  return 0;
}

function sumLineGrams(rows) {
  let total = 0;
  for (const row of rows) {
    total += parseGramsPerUnit(row.presentation, row.name, row.quantity);
  }
  return Math.round(total * 100) / 100;
}

function toIsoDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function hasUrl(value) {
  return Boolean(value && String(value).trim());
}

function printSection(title, count, rows, detailFn) {
  console.log(`\n${"=".repeat(72)}`);
  console.log(`${title}`);
  console.log(`Total: ${count}`);
  console.log("-".repeat(72));
  if (!rows.length) {
    console.log("  (ninguno)");
    return;
  }
  for (const row of rows) {
    console.log(
      `  #${row.id} · ${row.full_name} · ${row.rut ?? "—"} · ${detailFn(row)}`
    );
  }
}

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1 });

try {
  const now = new Date();
  const today = toIsoDateOnly(now);
  const currentMonth = monthKey(now);

  console.log("\n=== CultiSoft · Auditoría de compliance (DB producción) ===");
  console.log(`Fecha: ${today}`);
  console.log(`Mes evaluado (gramos): ${currentMonth}`);
  console.log(`Pedidos recientes: últimos ${RECENT_ORDER_DAYS} días`);

  const patients = await sql`
    SELECT id, full_name, rut, email
    FROM patients
    WHERE membership_status IS DISTINCT FROM 'deleted'
    ORDER BY id`;

  const patientMap = new Map(patients.map((p) => [p.id, p]));
  console.log(`\nPacientes activos (no deleted): ${patients.length}`);

  const accounts = await sql`
    SELECT
      c.id,
      c.email,
      c.patient_id,
      c.rut,
      c.prescription_status,
      c.prescription_url,
      c.id_front_url,
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
    ORDER BY c.created_at ASC`;

  const accountsByPatient = new Map();
  for (const acc of accounts) {
    const pid = acc.matched_patient_id;
    if (!accountsByPatient.has(pid)) accountsByPatient.set(pid, []);
    accountsByPatient.get(pid).push(acc);
  }

  // 1. Active rx expired
  const activeRxExpiredRaw = await sql`
    SELECT
      p.id,
      p.full_name,
      p.rut,
      r.id AS rx_id,
      r.folio,
      r.expiry_date
    FROM patients p
    JOIN prescriptions r ON r.patient_id = p.id
    WHERE p.membership_status IS DISTINCT FROM 'deleted'
      AND r.status = 'active'
      AND r.expiry_date < CURRENT_DATE
    ORDER BY r.expiry_date ASC, p.id`;

  const activeRxExpiredByPatient = new Map();
  for (const row of activeRxExpiredRaw) {
    if (!activeRxExpiredByPatient.has(row.id)) {
      activeRxExpiredByPatient.set(row.id, {
        id: row.id,
        full_name: row.full_name,
        rut: row.rut,
        rx_folios: [],
        earliest_expiry: row.expiry_date,
      });
    }
    const entry = activeRxExpiredByPatient.get(row.id);
    entry.rx_folios.push(row.folio);
    if (toIsoDateOnly(row.expiry_date) < toIsoDateOnly(entry.earliest_expiry)) {
      entry.earliest_expiry = row.expiry_date;
    }
  }
  const activeRxExpired = [...activeRxExpiredByPatient.values()].sort(
    (a, b) =>
      new Date(a.earliest_expiry).getTime() - new Date(b.earliest_expiry).getTime()
  );

  // 2. No valid rx (no active internal rx AND no aprobada web rx)
  const patientsWithActiveInternalRx = await sql`
    SELECT DISTINCT patient_id
    FROM prescriptions
    WHERE status = 'active'`;

  const activeInternalSet = new Set(patientsWithActiveInternalRx.map((r) => r.patient_id));

  const noValidRx = [];
  for (const p of patients) {
    if (activeInternalSet.has(p.id)) continue;
    const linked = accountsByPatient.get(p.id) || [];
    const hasApprovedWeb = linked.some((a) => a.prescription_status === "aprobada");
    if (hasApprovedWeb) continue;
    const webStatus =
      linked.find((a) => a.prescription_status !== "none")?.prescription_status ?? "none";
    noValidRx.push({
      id: p.id,
      full_name: p.full_name,
      rut: p.rut,
      web_rx_status: webStatus,
      linked_accounts: linked.length,
    });
  }

  // 3. Monthly grams >= 30g
  const dispLines = await sql`
    SELECT
      d.patient_id,
      di.quantity,
      pr.presentation,
      pr.name
    FROM dispensation_items di
    JOIN dispensations d ON d.id = di.dispensation_id
    JOIN products pr ON pr.id = di.product_id
    JOIN patients p ON p.id = d.patient_id
    WHERE p.membership_status IS DISTINCT FROM 'deleted'
      AND d.status = 'completed'
      AND TO_CHAR(d.dispensed_at, 'YYYY-MM') = ${currentMonth}`;

  const webLines = await sql`
    SELECT
      p.id AS patient_id,
      coi.quantity,
      pr.presentation,
      pr.name
    FROM customer_order_items coi
    JOIN customer_orders co ON co.id = coi.order_id
    JOIN products pr ON pr.id = coi.product_id
    JOIN customer_accounts c ON c.id = co.customer_account_id
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
    WHERE co.status NOT IN ('cancelled', 'rejected')
      AND TO_CHAR(co.created_at, 'YYYY-MM') = ${currentMonth}`;

  const gramsByPatient = new Map();
  for (const row of [...dispLines, ...webLines]) {
    const grams = parseGramsPerUnit(row.presentation, row.name, row.quantity);
    if (grams === 0) continue;
    gramsByPatient.set(
      row.patient_id,
      Math.round(((gramsByPatient.get(row.patient_id) || 0) + grams) * 100) / 100
    );
  }

  const monthlyGramsHigh = [];
  for (const [patientId, grams] of gramsByPatient) {
    if (grams < MONTHLY_GRAM_THRESHOLD) continue;
    const p = patientMap.get(patientId);
    if (!p) continue;
    monthlyGramsHigh.push({
      id: p.id,
      full_name: p.full_name,
      rut: p.rut,
      monthly_grams: grams,
    });
  }
  monthlyGramsHigh.sort((a, b) => b.monthly_grams - a.monthly_grams);

  // 4. Web rx pending/rechazada but has recent orders
  const recentOrders = await sql`
    SELECT
      p.id AS patient_id,
      COUNT(*)::int AS order_count,
      MAX(co.created_at) AS last_order_at
    FROM customer_orders co
    JOIN customer_accounts c ON c.id = co.customer_account_id
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
    WHERE co.status NOT IN ('cancelled', 'rejected')
      AND co.created_at >= NOW() - (${RECENT_ORDER_DAYS}::int * INTERVAL '1 day')
    GROUP BY p.id`;

  const webRxOrderViolations = [];
  for (const row of recentOrders) {
    const linked = accountsByPatient.get(row.patient_id) || [];
    if (!linked.length) continue;
    const hasApproved = linked.some((a) => a.prescription_status === "aprobada");
    if (hasApproved) continue;
    const badStatus = linked.some((a) =>
      ["pending", "rechazada"].includes(a.prescription_status)
    );
    if (!badStatus) continue;
    const p = patientMap.get(row.patient_id);
    if (!p) continue;
    const statuses = [...new Set(linked.map((a) => a.prescription_status))].join(", ");
    webRxOrderViolations.push({
      id: p.id,
      full_name: p.full_name,
      rut: p.rut,
      web_rx_status: statuses,
      recent_orders: row.order_count,
      last_order_at: toIsoDateOnly(row.last_order_at),
    });
  }
  webRxOrderViolations.sort((a, b) => b.recent_orders - a.recent_orders);

  // 5. Missing critical docs on linked account
  const missingDocs = [];
  for (const p of patients) {
    const linked = accountsByPatient.get(p.id) || [];
    if (!linked.length) continue;
    const primary = [...linked].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )[0];
    const missing = [];
    if (!hasUrl(primary.prescription_url)) missing.push("prescription_url");
    if (!hasUrl(primary.id_front_url)) missing.push("id_front");
    if (!missing.length) continue;
    missingDocs.push({
      id: p.id,
      full_name: p.full_name,
      rut: p.rut,
      account_id: primary.id,
      missing,
    });
  }

  const summary = {
    active_rx_expired: activeRxExpired.length,
    no_valid_rx: noValidRx.length,
    monthly_grams_ge_30: monthlyGramsHigh.length,
    web_rx_bad_with_recent_orders: webRxOrderViolations.length,
    missing_critical_docs: missingDocs.length,
  };

  console.log("\n--- Resumen ---");
  for (const [key, value] of Object.entries(summary)) {
    console.log(`  ${key}: ${value}`);
  }

  printSection(
    "1) Receta interna activa vencida (status=active, expiry < hoy)",
    summary.active_rx_expired,
    activeRxExpired.slice(0, TOP_N),
    (r) =>
      `venció ${toIsoDateOnly(r.earliest_expiry)} · folios: ${r.rx_folios.join(", ")}`
  );

  printSection(
    "2) Sin receta válida (sin rx interna activa y sin web aprobada)",
    summary.no_valid_rx,
    noValidRx.slice(0, TOP_N),
    (r) => `web_rx=${r.web_rx_status} · cuentas=${r.linked_accounts}`
  );

  printSection(
    `3) Gramos mes >= ${MONTHLY_GRAM_THRESHOLD}g (${currentMonth})`,
    summary.monthly_grams_ge_30,
    monthlyGramsHigh.slice(0, TOP_N),
    (r) => `${r.monthly_grams} g estimados`
  );

  printSection(
    `4) Receta web pending/rechazada con pedidos recientes (${RECENT_ORDER_DAYS}d)`,
    summary.web_rx_bad_with_recent_orders,
    webRxOrderViolations.slice(0, TOP_N),
    (r) =>
      `web_rx=${r.web_rx_status} · pedidos=${r.recent_orders} · último=${r.last_order_at}`
  );

  printSection(
    "5) Docs críticos faltantes en cuenta vinculada (prescription_url o id_front)",
    summary.missing_critical_docs,
    missingDocs.slice(0, TOP_N),
    (r) => `cuenta #${r.account_id} · falta: ${r.missing.join(", ")}`
  );

  console.log("\n");
} catch (e) {
  console.error("Error:", e.message);
  if (e.stack) console.error(e.stack);
  process.exitCode = 1;
} finally {
  await sql.end();
}