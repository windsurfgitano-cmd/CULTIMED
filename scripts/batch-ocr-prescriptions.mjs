#!/usr/bin/env node
/**
 * Batch OCR para customer_accounts con receta aprobada.
 *
 * Uso:
 *   node scripts/batch-ocr-prescriptions.mjs                    # dry-run, limit 10
 *   node scripts/batch-ocr-prescriptions.mjs --limit 5 --apply    # piloto
 *   node scripts/batch-ocr-prescriptions.mjs --limit 0 --apply  # todas
 *   node scripts/batch-ocr-prescriptions.mjs --force --apply      # re-OCR existentes
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force");
const limitIdx = process.argv.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? Number(process.argv[limitIdx + 1]) : 10;
const OCR_DELAY_MS = 2000;

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(path.join(root, "cultimed-store/package.json"));
const postgres = require("postgres");
const { createClient } = require("@supabase/supabase-js");
const { createWorker } = require("tesseract.js");

// ── Env (cultimed-store + cultisoft) ─────────────────────────────────────────

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    const key = m[1];
    const val = m[2].replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile(path.join(root, "cultimed-store", ".env.local"));
loadEnvFile(path.join(root, "cultisoft", ".env.local"));

const DATABASE_URL = process.env.DATABASE_URL;
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!DATABASE_URL) {
  console.error("DATABASE_URL no definido (revisa cultimed-store/.env.local o cultisoft/.env.local)");
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error(
    "Supabase no configurado: falta NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY"
  );
  process.exit(1);
}

// ── Storage (mirror cultisoft/lib/storage.ts) ────────────────────────────────

let _supabase = null;

function getStorageAdmin() {
  if (_supabase) return _supabase;
  _supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
  return _supabase;
}

async function getSignedUrl(bucket, objectPath, ttlSeconds = 3600) {
  const admin = getStorageAdmin();
  const { data, error } = await admin.storage
    .from(bucket)
    .createSignedUrl(objectPath, ttlSeconds);
  if (error || !data) throw new Error(`signed url failed: ${error?.message}`);
  return data.signedUrl;
}

async function resolveStorageUrl(stored) {
  if (!stored) return null;

  const match = stored.match(
    /^(prescriptions|payment-proofs|patient-documents):\/\/(.+)$/
  );
  if (match) {
    const bucket = match[1];
    const objectPath = match[2];
    try {
      return await getSignedUrl(bucket, objectPath);
    } catch {
      return null;
    }
  }

  if (stored.startsWith("/uploads/") || stored.startsWith("/")) {
    const base =
      process.env.STORE_PUBLIC_BASE ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      "";
    return `${base}${stored}`;
  }

  return stored;
}

function extensionFromStored(stored) {
  if (!stored) return "";
  const pathPart = stored.includes("://")
    ? stored.split("://")[1]
    : stored.split("?")[0];
  return path.extname(pathPart).toLowerCase();
}

function isPdf(stored, contentType) {
  const ext = extensionFromStored(stored);
  if (ext === ".pdf") return true;
  if (contentType && contentType.toLowerCase().includes("pdf")) return true;
  return false;
}

function isImage(stored, contentType) {
  const ext = extensionFromStored(stored);
  if ([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff"].includes(ext)) {
    return true;
  }
  if (contentType && contentType.toLowerCase().startsWith("image/")) return true;
  return false;
}

// ── parsePrescriptionText (inline from cultisoft/lib/prescription-ocr.ts) ────

const RUT_RE = /(\d{1,2}\.?\d{3}\.?\d{3}[-]?[\dkK])/gi;
const DATE_RE = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/g;
const DOCTOR_RE =
  /(?:Dr\.?a?|Dra\.?|doctor(?:a)?|m[eé]dico(?:\s+tratante)?)\s*[:\-]?\s*([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñÁÉÍÓÚÑ]+(?:\s+[A-ZÁÉÍÓÚÑ][A-Za-záéíóúñÁÉÍÓÚÑ]+){0,4})/i;
const PATIENT_RE =
  /(?:paciente|nombre(?:\s+del\s+paciente)?)\s*[:\-]?\s*([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñÁÉÍÓÚÑ]+(?:\s+[A-ZÁÉÍÓÚÑ][A-Za-záéíóúñÁÉÍÓÚÑ]+){0,4})/i;
const DIAG_RE = /diagn[oó]stico\s*[:\-]?\s*(.+?)(?:\n|$)/i;
const GRAMS_RE = /(\d{1,3})\s*g(?:ramos?)?(?:\s*\/\s*mes)?|gramaje\s*[:\-]?\s*(\d{1,3})/gi;
const EXPIRY_RE =
  /(?:venc(?:e|imiento)?|v[aá]lida\s+hasta|vigencia)\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i;

const PRODUCT_KEYWORDS = [
  { key: "flor", pattern: /\bflor(?:es)?\b/i },
  { key: "aceite", pattern: /\baceite\b/i },
  { key: "CBD", pattern: /\bCBD\b/i },
  { key: "THC", pattern: /\bTHC\b/i },
  { key: "cannabis", pattern: /\bcannabis\b/i },
  { key: "marihuana", pattern: /\bmarihuana\b/i },
  { key: "extracto", pattern: /\bextracto\b/i },
  { key: "cápsula", pattern: /\bc[aá]psulas?\b/i },
];

function formatRut(raw) {
  const clean = raw.replace(/\./g, "").toUpperCase();
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  return `${body}-${dv}`;
}

function parseChileanDate(day, month, year) {
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function extractDates(text) {
  const dates = [];
  for (const match of text.matchAll(DATE_RE)) {
    const iso = parseChileanDate(
      parseInt(match[1], 10),
      parseInt(match[2], 10),
      parseInt(match[3], 10)
    );
    if (iso) dates.push(iso);
  }
  return dates;
}

function addMonths(isoDate, months) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y, m - 1 + months, d);
  return date.toISOString().slice(0, 10);
}

function extractRuts(text) {
  const seen = new Set();
  const ruts = [];
  for (const match of text.matchAll(RUT_RE)) {
    const formatted = formatRut(match[1]);
    if (!seen.has(formatted)) {
      seen.add(formatted);
      ruts.push(formatted);
    }
  }
  return ruts;
}

function extractMonthlyGrams(text) {
  let best = 0;
  for (const match of text.matchAll(GRAMS_RE)) {
    const grams = parseInt(match[1] || match[2], 10);
    if (!Number.isNaN(grams) && grams > best && grams <= 500) best = grams;
  }
  return best || 30;
}

function extractProducts(text) {
  const found = [];
  for (const { key, pattern } of PRODUCT_KEYWORDS) {
    if (pattern.test(text)) found.push(key);
  }
  return found;
}

function guessIssueDate(text, dates) {
  const issueHint = text.match(
    /(?:fecha|emitid[ao]|emisión|expedici[oó]n)\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i
  );
  if (issueHint) {
    const m = issueHint[1].match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (m) {
      const iso = parseChileanDate(
        parseInt(m[1], 10),
        parseInt(m[2], 10),
        parseInt(m[3], 10)
      );
      if (iso) return iso;
    }
  }
  return dates[0] ?? null;
}

function guessExpiryDate(text, issueDate, dates) {
  const expiryMatch = text.match(EXPIRY_RE);
  if (expiryMatch) {
    const m = expiryMatch[1].match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (m) {
      const iso = parseChileanDate(
        parseInt(m[1], 10),
        parseInt(m[2], 10),
        parseInt(m[3], 10)
      );
      if (iso) return iso;
    }
  }
  if (dates.length > 1) return dates[dates.length - 1];
  if (issueDate) return addMonths(issueDate, 6);
  return null;
}

function assignRuts(text, ruts) {
  if (ruts.length === 0) return { patientRut: null, doctorRut: null };
  if (ruts.length === 1) return { patientRut: ruts[0], doctorRut: null };

  const lower = text.toLowerCase();
  const patientIdx = ruts.findIndex((rut) => {
    const pos = lower.indexOf(rut.toLowerCase().replace("-", ""));
    const before = lower.slice(Math.max(0, pos - 40), pos);
    return /paciente|nombre/.test(before);
  });
  const doctorIdx = ruts.findIndex((rut) => {
    const pos = lower.indexOf(rut.toLowerCase().replace("-", ""));
    const before = lower.slice(Math.max(0, pos - 40), pos);
    return /dr\.?|dra\.?|m[eé]dico|doctor/.test(before);
  });

  if (patientIdx >= 0 && doctorIdx >= 0 && patientIdx !== doctorIdx) {
    return { patientRut: ruts[patientIdx], doctorRut: ruts[doctorIdx] };
  }

  return { patientRut: ruts[0], doctorRut: ruts[1] };
}

function computeConfidence(data) {
  let score = 0;
  if (data.patientRut) score += 2;
  if (data.doctorName || data.doctorRut) score += 2;
  if (data.issueDate) score += 2;
  if (data.patientName) score += 1;
  if (data.products.length > 0) score += 1;
  if (data.diagnosis) score += 1;
  if (data.monthlyGrams !== 30) score += 1;

  if (score >= 6) return "high";
  if (score >= 3) return "medium";
  return "low";
}

function parsePrescriptionText(text) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  const dates = extractDates(normalized);
  const ruts = extractRuts(normalized);
  const { patientRut, doctorRut } = assignRuts(normalized, ruts);

  const patientMatch = normalized.match(PATIENT_RE);
  const doctorMatch = normalized.match(DOCTOR_RE);
  const diagMatch = normalized.match(DIAG_RE);

  const issueDate = guessIssueDate(normalized, dates);
  const expiryDate = guessExpiryDate(normalized, issueDate, dates);
  const products = extractProducts(normalized);
  const monthlyGrams = extractMonthlyGrams(normalized);

  const base = {
    patientName: patientMatch?.[1]?.trim() ?? null,
    patientRut,
    doctorName: doctorMatch?.[1]?.trim() ?? null,
    doctorRut,
    issueDate,
    expiryDate,
    products,
    monthlyGrams,
    diagnosis: diagMatch?.[1]?.trim().slice(0, 200) ?? null,
  };

  return {
    ...base,
    confidence: computeConfidence(base),
    extractedAt: new Date().toISOString(),
    rawExcerpt: normalized.slice(0, 1500),
  };
}

// ── OCR ──────────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let ocrWorker = null;

async function getOcrWorker() {
  if (!ocrWorker) {
    ocrWorker = await createWorker("spa");
  }
  return ocrWorker;
}

async function runOcrOnBuffer(buffer) {
  const worker = await getOcrWorker();
  const res = await worker.recognize(buffer);
  return res.data.text || "";
}

function parseStorageRef(stored) {
  const s = String(stored || "");
  const legacy = s.match(/^bucket:\/\/(prescriptions|payment-proofs|patient-documents)\/(.+)$/);
  if (legacy) return { bucket: legacy[1], objectPath: legacy[2] };
  const match = s.match(/^(prescriptions|payment-proofs|patient-documents):\/\/(.+)$/);
  if (!match) return null;
  return { bucket: match[1], objectPath: match[2] };
}

async function downloadFromStorage(stored) {
  const ref = parseStorageRef(stored);
  if (!ref) return null;
  const admin = getStorageAdmin();
  const { data, error } = await admin.storage.from(ref.bucket).download(ref.objectPath);
  if (error || !data) {
    throw new Error(`storage download failed: ${error?.message || "no data"}`);
  }
  const buffer = Buffer.from(await data.arrayBuffer());
  const ext = path.extname(ref.objectPath).toLowerCase();
  const contentType =
    ext === ".pdf"
      ? "application/pdf"
      : ext === ".png"
        ? "image/png"
        : ext === ".webp"
          ? "image/webp"
          : "image/jpeg";
  return { buffer, contentType };
}

async function downloadPrescription(stored, url) {
  try {
    const direct = await downloadFromStorage(stored);
    if (direct) return direct;
  } catch (e) {
    if (!url) throw e;
  }
  if (!url) throw new Error("no se pudo resolver URL de storage");
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`download failed: HTTP ${res.status}`);
  }
  const contentType = res.headers.get("content-type") || "";
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, contentType };
}

async function extractPdfText(buffer) {
  const { PDFParse } = require("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const parsed = await parser.getText();
    return parsed.text || "";
  } finally {
    await parser.destroy();
  }
}

async function extractText(buffer, contentType, stored) {
  if (isPdf(stored, contentType)) {
    return extractPdfText(buffer);
  }
  return runOcrOnBuffer(buffer);
}

// ── Main ─────────────────────────────────────────────────────────────────────

const sql = postgres(DATABASE_URL, { ssl: "require", max: 1 });

const summary = { ok: 0, fail: 0, skipped: 0 };

function logProgress(status, account, detail = "") {
  const suffix = detail ? ` — ${detail}` : "";
  console.log(`[${status.toUpperCase()}] account #${account.id} ${account.email}${suffix}`);
}

try {
  console.log("CULTISOFT · Batch OCR recetas aprobadas");
  console.log(`Fecha: ${new Date().toISOString()}`);
  console.log(
    `Modo: ${APPLY ? "APPLY" : "DRY-RUN"} | limit: ${LIMIT === 0 ? "all" : LIMIT} | force: ${FORCE}\n`
  );

  const rows = await sql`
    SELECT
      id,
      email,
      full_name,
      prescription_url,
      prescription_ocr_data,
      prescription_ocr_at
    FROM customer_accounts
    WHERE prescription_status = 'aprobada'
      AND prescription_url IS NOT NULL
      AND (${FORCE} OR prescription_ocr_data IS NULL)
    ORDER BY id
  `;

  const targets = LIMIT > 0 ? rows.slice(0, LIMIT) : rows;

  console.log(
    `Candidatos en DB: ${rows.length} | a procesar en esta corrida: ${targets.length}\n`
  );

  if (!targets.length) {
    console.log("Nada que procesar.");
  }

  let ocrCalls = 0;

  for (const account of targets) {
    const hadOcr = account.prescription_ocr_data != null;

    const ext = extensionFromStored(account.prescription_url);
    const supported =
      isPdf(account.prescription_url) ||
      isImage(account.prescription_url) ||
      [".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(ext);

    if (!supported) {
      summary.skipped++;
      logProgress(
        "skipped",
        account,
        `formato no soportado (${ext || "desconocido"})`
      );
      continue;
    }

    try {
      const url = await resolveStorageUrl(account.prescription_url);

      if (ocrCalls > 0) {
        await sleep(OCR_DELAY_MS);
      }

      const { buffer, contentType } = await downloadPrescription(
        account.prescription_url,
        url
      );

      if (!isPdf(account.prescription_url, contentType) && !isImage(account.prescription_url, contentType)) {
        summary.skipped++;
        logProgress(
          "skipped",
          account,
          `formato no soportado (${contentType || ext})`
        );
        continue;
      }

      const rawText = await extractText(buffer, contentType, account.prescription_url);
      ocrCalls++;

      const ocrData = parsePrescriptionText(rawText);

      if (APPLY) {
        await sql`
          UPDATE customer_accounts
          SET prescription_ocr_data = ${sql.json(ocrData)},
              prescription_ocr_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ${account.id}
        `;
      }

      summary.ok++;
      const reocr = hadOcr ? " [re-OCR]" : "";
      logProgress(
        APPLY ? "ok" : "would-ok",
        account,
        `confidence=${ocrData.confidence} patientRut=${ocrData.patientRut || "-"} grams=${ocrData.monthlyGrams}${reocr}`
      );
    } catch (err) {
      summary.fail++;
      logProgress("fail", account, err.message || String(err));
    }
  }

  console.log("\n=== Resumen ===");
  console.log(`OK:      ${summary.ok}`);
  console.log(`FAIL:    ${summary.fail}`);
  console.log(`SKIPPED: ${summary.skipped}`);
  console.log(`Total:   ${targets.length}`);

  if (!APPLY && summary.ok > 0) {
    console.log("\nDry-run completo. Re-ejecuta con --apply para guardar en BD.");
  } else if (APPLY && summary.ok > 0) {
    console.log(`\n✅ ${summary.ok} cuenta(s) actualizada(s) con prescription_ocr_data.`);
  }
} catch (e) {
  console.error("Error fatal:", e.message);
  process.exitCode = 1;
} finally {
  if (ocrWorker) await ocrWorker.terminate();
  await sql.end();
}