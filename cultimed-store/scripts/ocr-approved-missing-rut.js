// Extrae texto/datos desde recetas aprobadas sin RUT.
// No escribe en BD. Genera reporte JSON para revisión manual.
// Uso: node scripts/ocr-approved-missing-rut.js [--limit N]
require("fs").readFileSync(".env.local", "utf8").split(/\r?\n/).forEach((line) => {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
});

const fs = require("node:fs");
const path = require("node:path");
const postgres = require("postgres");
const { createClient } = require("@supabase/supabase-js");
const { createWorker } = require("tesseract.js");

const limitIdx = process.argv.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? Number(process.argv[limitIdx + 1]) : null;
const OUT_DIR = path.resolve(__dirname, "..", "data", "ocr");

const DATABASE_URL = process.env.DATABASE_URL;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!DATABASE_URL) throw new Error("DATABASE_URL no definido");
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Supabase no configurado");

const sql = postgres(DATABASE_URL, { prepare: false, ssl: "require", max: 1 });
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function parseStorageRef(stored) {
  const match = String(stored || "").match(/^(prescriptions|payment-proofs|patient-documents):\/\/(.+)$/);
  if (!match) return null;
  return { bucket: match[1], objectPath: match[2] };
}

function cleanText(text) {
  return String(text || "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeRut(raw) {
  const clean = String(raw || "").replace(/[^0-9kK]/g, "").toUpperCase();
  if (clean.length < 8 || clean.length > 9) return null;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  return `${body.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${dv}`;
}

function rutIsValid(raw) {
  const clean = String(raw || "").replace(/[^0-9kK]/g, "").toUpperCase();
  if (!/^\d{7,8}[0-9K]$/.test(clean)) return false;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  let sum = 0;
  let mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const expectedNum = 11 - (sum % 11);
  const expected = expectedNum === 11 ? "0" : expectedNum === 10 ? "K" : String(expectedNum);
  return dv === expected;
}

function extractRuts(text) {
  const candidates = new Set();
  const patterns = [
    /\b\d{1,2}\.?\d{3}\.?\d{3}\s*-\s*[0-9kK]\b/g,
    /\b\d{7,8}\s*-\s*[0-9kK]\b/g,
    /\b\d{8,9}\b/g,
  ];
  for (const pattern of patterns) {
    const matches = text.match(pattern) || [];
    for (const m of matches) {
      if (rutIsValid(m)) candidates.add(normalizeRut(m));
    }
  }
  return [...candidates];
}

function contextFor(text, needle, span = 120) {
  const idx = text.indexOf(needle);
  if (idx < 0) return null;
  return text.slice(Math.max(0, idx - span), Math.min(text.length, idx + needle.length + span)).replace(/\s+/g, " ").trim();
}

function pickRutRoles(text, ruts) {
  const lower = text.toLowerCase();
  const roles = {};
  for (const rut of ruts) {
    const ctx = contextFor(text, rut) || contextFor(text.replace(/\./g, ""), rut.replace(/\./g, "")) || "";
    const lctx = ctx.toLowerCase();
    const scorePatient = ["paciente", "nombre paciente", "rut paciente", "usuario", "beneficiario"].filter((w) => lctx.includes(w)).length;
    const scoreDoctor = ["médico", "medico", "doctor", "dra", "dr.", "profesional", "tratante", "registro", "superintendencia"].filter((w) => lctx.includes(w)).length;
    roles[rut] = { context: ctx, scorePatient, scoreDoctor };
  }
  const patientRut = ruts
    .map((rut) => ({ rut, score: roles[rut].scorePatient - roles[rut].scoreDoctor }))
    .sort((a, b) => b.score - a.score)[0]?.score > 0
      ? ruts.map((rut) => ({ rut, score: roles[rut].scorePatient - roles[rut].scoreDoctor })).sort((a, b) => b.score - a.score)[0].rut
      : null;
  const doctorRut = ruts
    .map((rut) => ({ rut, score: roles[rut].scoreDoctor - roles[rut].scorePatient }))
    .sort((a, b) => b.score - a.score)[0]?.score > 0
      ? ruts.map((rut) => ({ rut, score: roles[rut].scoreDoctor - roles[rut].scorePatient })).sort((a, b) => b.score - a.score)[0].rut
      : null;
  return { roles, patientRut, doctorRut };
}

function extractNames(text) {
  const lines = cleanText(text).split("\n").map((l) => l.trim()).filter(Boolean);
  const patientLine = lines.find((l) => /paciente|nombre paciente|usuario|beneficiario/i.test(l)) || null;
  const doctorLine = lines.find((l) => /m[eé]dico|doctor|dra\.?|dr\.?|profesional/i.test(l)) || null;
  const issuerLine = lines.find((l) => /centro|cl[ií]nica|consulta|sociedad|empresa|instituci[oó]n|prestador/i.test(l)) || null;
  return { patientLine, doctorLine, issuerLine };
}

function extractStructured(text) {
  const one = cleanText(text).replace(/\n/g, " ").replace(/\s+/g, " ");
  const rutPattern = "([0-9]{1,2}\\.?[0-9]{3}\\.?[0-9]{3}\\s*-?\\s*[0-9kK]|[0-9]{7,8}\\s*-?\\s*[0-9kK])";
  const patientPatterns = [
    new RegExp(`Paciente:\\s*([^:]{3,90}?)\\s+RUN:\\s*${rutPattern}`, "i"),
    new RegExp(`Datos Paciente\\s+Nombre:\\s*([^:]{3,90}?)\\s+Rut:\\s*${rutPattern}`, "i"),
    new RegExp(`Nombre:\\s*([^:]{3,90}?)\\s+Rut:\\s*${rutPattern}`, "i"),
  ];
  const doctorPatterns = [
    new RegExp(`Datos M[eé]dico\\s+Dr\\(a\\):\\s*([^:]{3,90}?)\\s+Rut:\\s*${rutPattern}`, "i"),
    new RegExp(`([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ ]{5,90}?)\\s+Medicina general\\s+RUN:\\s*${rutPattern}`, "i"),
    new RegExp(`([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ ]{5,90}?)\\s+RUN:\\s*${rutPattern}\\s*/\\s*REG-SIS`, "i"),
  ];
  const birthPatterns = [
    /Fec(?:ha)?\s*Nacimiento:\s*([0-9]{2}[-/][0-9]{2}[-/][0-9]{4})/i,
    /Fecha de Nacimiento:\s*([0-9]{2}[-/][0-9]{2}[-/][0-9]{4})/i,
  ];
  const addressPatterns = [
    /Direcci[oó]n:\s*([^\n]+?)(?:\s+--|\s+Diagn[oó]stico|\s+Fecha|$)/i,
    /Direcci[oó]n\s+([^\n]+?)\s+Comuna\s+([^\n]+?)\s+Ciudad\s+([^\n]+?)(?:\s+Fecha|$)/i,
  ];

  const out = {
    patientName: null,
    patientRut: null,
    patientBirthDate: null,
    patientAddress: null,
    doctorName: null,
    doctorRut: null,
    issuer: null,
  };

  for (const pattern of patientPatterns) {
    const m = one.match(pattern);
    if (m && rutIsValid(m[2])) {
      out.patientName = m[1].trim().replace(/\s+/g, " ");
      out.patientRut = normalizeRut(m[2]);
      break;
    }
  }
  for (const pattern of doctorPatterns) {
    const m = one.match(pattern);
    if (m && rutIsValid(m[2])) {
      out.doctorName = m[1].trim().replace(/\s+/g, " ");
      out.doctorRut = normalizeRut(m[2]);
      break;
    }
  }
  for (const pattern of birthPatterns) {
    const m = one.match(pattern);
    if (m) {
      const [d, mo, y] = m[1].split(/[-/]/);
      out.patientBirthDate = `${y}-${mo}-${d}`;
      break;
    }
  }
  for (const pattern of addressPatterns) {
    const m = one.match(pattern);
    if (m) {
      out.patientAddress = m.slice(1).filter(Boolean).join(", ").trim().replace(/\s+/g, " ");
      break;
    }
  }
  const issuer = one.match(/Centro m[eé]dico\s+([^\n\r]+?)(?:\s+Dr\.?|\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\s+Medicina|$)/i)
    || one.match(/(Centro m[eé]dico LAR)/i)
    || one.match(/(Recemed|Salcobrand|Cruz Verde|Farmacias? Ahumada|RedSalud|IntegraM[eé]dica)/i);
  if (issuer) out.issuer = issuer[0].trim().replace(/\s+/g, " ");

  return out;
}

async function downloadStorage(stored) {
  const ref = parseStorageRef(stored);
  if (!ref) throw new Error(`storage ref inválido: ${stored}`);
  const { data, error } = await supabase.storage.from(ref.bucket).download(ref.objectPath);
  if (error || !data) throw new Error(`download failed: ${error?.message}`);
  return { ref, buffer: Buffer.from(await data.arrayBuffer()) };
}

async function extractPdfText(buffer) {
  const { PDFParse } = require("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const parsed = await parser.getText();
    return cleanText(parsed.text || "");
  } finally {
    await parser.destroy();
  }
}

let worker = null;
async function extractImageText(buffer) {
  if (!worker) {
    worker = await createWorker("spa+eng");
  }
  const res = await worker.recognize(buffer);
  return cleanText(res.data.text || "");
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const rows = await sql`
    SELECT id, email, full_name, prescription_url, prescription_uploaded_at
    FROM customer_accounts
    WHERE prescription_status = 'aprobada'
      AND (rut IS NULL OR TRIM(rut) = '')
      AND prescription_url IS NOT NULL
    ORDER BY id
  `;
  const targets = LIMIT ? rows.slice(0, LIMIT) : rows;
  const report = [];

  console.log(`Procesando ${targets.length} recetas aprobadas sin RUT con archivo...`);

  for (const row of targets) {
    const item = {
      accountId: Number(row.id),
      email: row.email,
      fullName: row.full_name,
      prescriptionUrl: row.prescription_url,
      status: "pending",
      extraction: null,
      ruts: [],
      suggested: null,
      rawTextFile: null,
      error: null,
    };

    try {
      const { ref, buffer } = await downloadStorage(row.prescription_url);
      const ext = path.extname(ref.objectPath).toLowerCase();
      let text = "";
      let method = "unknown";

      if (ext === ".pdf") {
        method = "pdf-text";
        text = await extractPdfText(buffer);
        if (!text || text.length < 40) {
          item.status = "needs_pdf_ocr";
          item.error = "PDF sin texto extraíble; requiere conversión a imagen/OCR externo";
        }
      } else if ([".jpg", ".jpeg", ".png", ".webp"].includes(ext)) {
        method = "image-ocr";
        text = await extractImageText(buffer);
      } else {
        item.status = "unsupported";
        item.error = `Extensión no soportada: ${ext}`;
      }

      const rawText = cleanText(text);
      const rawFile = path.join(OUT_DIR, `account-${row.id}.txt`);
      fs.writeFileSync(rawFile, rawText || "", "utf8");
      item.rawTextFile = rawFile;
      item.extraction = { method, ext, textLength: rawText.length };

      const ruts = extractRuts(rawText);
      const roleData = pickRutRoles(rawText, ruts);
      const names = extractNames(rawText);
      const structured = extractStructured(rawText);
      item.ruts = ruts.map((rut) => ({ rut, ...roleData.roles[rut] }));
      item.suggested = {
        patientRut: structured.patientRut || roleData.patientRut || (ruts.length === 1 ? ruts[0] : null),
        doctorRut: structured.doctorRut || roleData.doctorRut,
        structured,
        ...names,
      };
      if (!item.status.startsWith("needs") && item.status !== "unsupported") item.status = ruts.length ? "extracted" : "no_rut_found";
      console.log(`${item.status.toUpperCase()} ca=${row.id} ${row.email} ruts=${ruts.join(",") || "-"}`);
    } catch (e) {
      item.status = "error";
      item.error = e.message || String(e);
      console.log(`ERROR ca=${row.id} ${row.email}: ${item.error}`);
    }

    report.push(item);
  }

  if (worker) await worker.terminate();
  await sql.end();

  const out = path.join(OUT_DIR, `approved-missing-rut-report-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
  console.log(`\nReporte: ${out}`);
})();
