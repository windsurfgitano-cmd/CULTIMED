export interface PrescriptionOcrData {
  patientName: string | null;
  patientRut: string | null;
  doctorName: string | null;
  doctorRut: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  products: string[];
  monthlyGrams: number;
  diagnosis: string | null;
  confidence: "low" | "medium" | "high";
  extractedAt: string;
  rawExcerpt: string;
}

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

const PRODUCT_KEYWORDS: { key: string; pattern: RegExp }[] = [
  { key: "flor", pattern: /\bflor(?:es)?\b/i },
  { key: "aceite", pattern: /\baceite\b/i },
  { key: "CBD", pattern: /\bCBD\b/i },
  { key: "THC", pattern: /\bTHC\b/i },
  { key: "cannabis", pattern: /\bcannabis\b/i },
  { key: "marihuana", pattern: /\bmarihuana\b/i },
  { key: "extracto", pattern: /\bextracto\b/i },
  { key: "cápsula", pattern: /\bc[aá]psulas?\b/i },
];

function formatRut(raw: string): string {
  const clean = raw.replace(/\./g, "").toUpperCase();
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  return `${body}-${dv}`;
}

function parseChileanDate(day: number, month: number, year: number): string | null {
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function extractDates(text: string): string[] {
  const dates: string[] = [];
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

function addMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y, m - 1 + months, d);
  return date.toISOString().slice(0, 10);
}

function extractRuts(text: string): string[] {
  const seen = new Set<string>();
  const ruts: string[] = [];
  for (const match of text.matchAll(RUT_RE)) {
    const formatted = formatRut(match[1]);
    if (!seen.has(formatted)) {
      seen.add(formatted);
      ruts.push(formatted);
    }
  }
  return ruts;
}

function extractMonthlyGrams(text: string): number {
  let best = 0;
  for (const match of text.matchAll(GRAMS_RE)) {
    const grams = parseInt(match[1] || match[2], 10);
    if (!Number.isNaN(grams) && grams > best && grams <= 500) best = grams;
  }
  return best || 30;
}

function extractProducts(text: string): string[] {
  const found: string[] = [];
  for (const { key, pattern } of PRODUCT_KEYWORDS) {
    if (pattern.test(text)) found.push(key);
  }
  return found;
}

function guessIssueDate(text: string, dates: string[]): string | null {
  const issueHint = text.match(
    /(?:fecha|emitid[ao]|emisión|expedici[oó]n)\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i
  );
  if (issueHint) {
    const m = issueHint[1].match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (m) {
      const iso = parseChileanDate(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10));
      if (iso) return iso;
    }
  }
  return dates[0] ?? null;
}

function guessExpiryDate(text: string, issueDate: string | null, dates: string[]): string | null {
  const expiryMatch = text.match(EXPIRY_RE);
  if (expiryMatch) {
    const m = expiryMatch[1].match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (m) {
      const iso = parseChileanDate(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10));
      if (iso) return iso;
    }
  }
  if (dates.length > 1) return dates[dates.length - 1];
  if (issueDate) return addMonths(issueDate, 6);
  return null;
}

function assignRuts(
  text: string,
  ruts: string[]
): { patientRut: string | null; doctorRut: string | null } {
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

function computeConfidence(data: Omit<PrescriptionOcrData, "confidence" | "extractedAt" | "rawExcerpt">): "low" | "medium" | "high" {
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

export function parsePrescriptionText(text: string): PrescriptionOcrData {
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