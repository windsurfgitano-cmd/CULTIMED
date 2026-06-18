#!/usr/bin/env node
/**
 * Test compliance data for a patient (default: 91).
 * Uso: node scripts/test-compliance.mjs [patientId]
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const PATIENT_ID = Number(process.argv[2] || 91);
const DEFAULT_MONTHLY_GRAM_LIMIT = 30;
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

function normalizeRut(rut) {
  if (!rut) return null;
  return rut.replace(/\./g, "").replace(/-/g, "").toUpperCase();
}

function monthKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function parseAmount(raw) {
  const n = parseFloat(raw.replace(",", "."));
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

function parseOcrData(raw) {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") return raw;
  return null;
}

function parseMonthlyGramLimit(raw) {
  const ocr = parseOcrData(raw);
  if (!ocr?.monthlyGrams) return null;
  const n =
    typeof ocr.monthlyGrams === "string"
      ? parseFloat(ocr.monthlyGrams.replace(",", "."))
      : ocr.monthlyGrams;
  return Number.isFinite(n) && n > 0 ? n : null;
}

function toIsoDateOnly(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function addMonths(isoDate, months) {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate;
  d.setMonth(d.getMonth() + months);
  return toIsoDateOnly(d);
}

function daysUntil(isoDate) {
  if (!isoDate) return null;
  const expiry = new Date(isoDate);
  if (Number.isNaN(expiry.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);
  return Math.ceil((expiry.getTime() - today.getTime()) / 86_400_000);
}

function pickPrimaryAccount(accounts, patientId) {
  if (!accounts.length) return null;
  const linked = accounts.filter((a) => a.patient_id === patientId);
  const pool = linked.length ? linked : accounts;
  return [...pool].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )[0];
}

function resolveRxFromAccounts(accounts) {
  let bestOcrExpiry = null;
  let bestOcrDoctor = null;
  let hasWebApproved = false;
  let webRxStatus = null;

  for (const acc of accounts) {
    if (!webRxStatus || acc.prescription_status !== "none") {
      webRxStatus = acc.prescription_status;
    }
    if (acc.prescription_status === "aprobada") hasWebApproved = true;

    const ocr = parseOcrData(acc.prescription_ocr_data);
    if (ocr?.issueDate) {
      const expiry = addMonths(ocr.issueDate, 6);
      if (!bestOcrExpiry || expiry > bestOcrExpiry) {
        bestOcrExpiry = expiry;
        bestOcrDoctor = ocr.doctorName?.trim() || null;
      }
    }
  }

  if (bestOcrExpiry) {
    return { expiryDate: bestOcrExpiry, doctorName: bestOcrDoctor, source: "web_ocr", webRxStatus };
  }
  if (hasWebApproved) {
    return { expiryDate: null, doctorName: null, source: "web", webRxStatus };
  }
  return { expiryDate: null, doctorName: null, source: "none", webRxStatus };
}

function resolveMonthlyLimit(accounts, primary) {
  if (primary?.prescription_ocr_data !== undefined) {
    const fromPrimary = parseMonthlyGramLimit(primary.prescription_ocr_data);
    if (fromPrimary) return fromPrimary;
  }
  for (const acc of accounts) {
    if (acc.prescription_ocr_data === undefined) continue;
    const limit = parseMonthlyGramLimit(acc.prescription_ocr_data);
    if (limit) return limit;
  }
  return DEFAULT_MONTHLY_GRAM_LIMIT;
}

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1 });

try {
  console.log(`\n=== Compliance test — patient #${PATIENT_ID} ===\n`);

  const [patient] = await sql`SELECT id, full_name, rut, email FROM patients WHERE id = ${PATIENT_ID}`;
  if (!patient) {
    console.error(`Patient #${PATIENT_ID} not found`);
    process.exit(1);
  }

  const patientRut = normalizeRut(patient.rut);
  const patientEmail = patient.email?.trim().toLowerCase() || null;
  const rutNorm = patientRut || "";
  const emailNorm = patientEmail || "";

  const accounts = await sql`
    SELECT c.id, c.email, c.patient_id, c.rut, c.prescription_status,
      c.prescription_ocr_data, c.created_at,
      CASE
        WHEN c.patient_id = ${PATIENT_ID} THEN 'patient_id'
        WHEN ${rutNorm} <> '' AND REPLACE(REPLACE(UPPER(c.rut), '.', ''), '-', '') = ${rutNorm} THEN 'rut'
        WHEN ${emailNorm} <> '' AND LOWER(c.email) = ${emailNorm} THEN 'email'
        ELSE 'other'
      END as link_source
    FROM customer_accounts c
    WHERE c.patient_id = ${PATIENT_ID}
       OR (${rutNorm} <> '' AND REPLACE(REPLACE(UPPER(c.rut), '.', ''), '-', '') = ${rutNorm})
       OR (${emailNorm} <> '' AND LOWER(c.email) = ${emailNorm})
    ORDER BY c.created_at ASC`;

  const accountIds = [...new Set(accounts.map((a) => a.id))];

  const [rxStats] = await sql`
    SELECT
      COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE status = 'active')::int as active,
      MAX(expiry_date) FILTER (WHERE status = 'active') as latest_active_expiry
    FROM prescriptions
    WHERE patient_id = ${PATIENT_ID}`;

  let orderCount = 0;
  if (accountIds.length) {
    const [wo] = await sql`
      SELECT COUNT(*)::int as c FROM customer_orders
      WHERE customer_account_id = ANY(${accountIds})
        AND status NOT IN ('cancelled', 'rejected')`;
    orderCount = wo.c;
  }

  const currentMonth = monthKey(new Date());

  const dispLines = await sql`
    SELECT di.quantity, pr.presentation, pr.name
    FROM dispensation_items di
    JOIN dispensations d ON d.id = di.dispensation_id
    JOIN products pr ON pr.id = di.product_id
    WHERE d.patient_id = ${PATIENT_ID}
      AND d.status = 'completed'
      AND TO_CHAR(d.dispensed_at, 'YYYY-MM') = ${currentMonth}`;

  let webLines = [];
  if (accountIds.length) {
    webLines = await sql`
      SELECT coi.quantity, pr.presentation, pr.name
      FROM customer_order_items coi
      JOIN customer_orders co ON co.id = coi.order_id
      JOIN products pr ON pr.id = coi.product_id
      WHERE co.customer_account_id = ANY(${accountIds})
        AND co.status NOT IN ('cancelled', 'rejected')
        AND TO_CHAR(co.created_at, 'YYYY-MM') = ${currentMonth}`;
  }

  const monthlyGramsUsed = sumLineGrams([...dispLines, ...webLines]);
  const primaryAccount = pickPrimaryAccount(accounts, PATIENT_ID);
  const monthlyGramLimit = resolveMonthlyLimit(accounts, primaryAccount);
  const monthlyPercent =
    monthlyGramLimit > 0
      ? Math.round((monthlyGramsUsed / monthlyGramLimit) * 1000) / 10
      : 0;

  const [internalRx] = await sql`
    SELECT r.expiry_date, d.full_name as doctor_name
    FROM prescriptions r
    JOIN doctors d ON d.id = r.doctor_id
    WHERE r.patient_id = ${PATIENT_ID} AND r.status = 'active'
    ORDER BY r.expiry_date DESC
    LIMIT 1`;

  const webRx = resolveRxFromAccounts(accounts);

  let rxExpiryDate = null;
  let rxDoctorName = null;
  let rxSource = "none";

  if (internalRx) {
    rxExpiryDate = toIsoDateOnly(internalRx.expiry_date);
    rxDoctorName = internalRx.doctor_name;
    rxSource = "internal";
  } else if (webRx.expiryDate) {
    rxExpiryDate = webRx.expiryDate;
    rxDoctorName = webRx.doctorName;
    rxSource = "web_ocr";
  } else if (webRx.source === "web") {
    rxSource = "web";
  }

  const daysToRxExpiry = daysUntil(rxExpiryDate);

  console.log(`Paciente: ${patient.full_name} (${patient.rut})`);
  console.log(`Mes evaluado: ${currentMonth}`);
  console.log("");
  console.log("--- Datos base ---");
  console.log(`  Recetas (total):     ${rxStats.total}`);
  console.log(`  Recetas (activas):   ${rxStats.active}`);
  console.log(`  Pedidos web:         ${orderCount}`);
  console.log(`  Cuentas vinculadas:  ${accounts.length}`);
  if (accounts.length) {
    const bySource = accounts.reduce((acc, a) => {
      acc[a.link_source] = (acc[a.link_source] || 0) + 1;
      return acc;
    }, {});
    console.log(`  Cuentas por vínculo: ${JSON.stringify(bySource)}`);
    for (const acc of accounts) {
      console.log(`    #${acc.id} · ${acc.email} · rx=${acc.prescription_status} · ${acc.link_source}`);
    }
  }
  console.log("");
  console.log("--- Compliance ---");
  console.log(`  Gramos mes (est.):   ${monthlyGramsUsed} g / ${monthlyGramLimit} g (${monthlyPercent}%)`);
  console.log(`  Líneas dispensación: ${dispLines.length}`);
  console.log(`  Líneas pedido web:   ${webLines.length}`);
  console.log(`  Receta vence:        ${rxExpiryDate ?? "(sin fecha)"}`);
  console.log(`  Días a vencimiento:  ${daysToRxExpiry ?? "—"}`);
  console.log(`  Médico receta:       ${rxDoctorName ?? "—"}`);
  console.log(`  Fuente receta:       ${rxSource}`);
  console.log(`  Estado receta web:   ${webRx.webRxStatus ?? "—"}`);

  const ok =
    accounts.length > 0 ||
    rxStats.total > 0 ||
    orderCount > 0 ||
    monthlyGramsUsed > 0 ||
    rxExpiryDate;

  console.log("");
  console.log(ok ? "✅ Datos de compliance encontrados" : "⚠️  Sin datos de compliance para este paciente");
  console.log("");
} catch (e) {
  console.error("Error:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}