import { all, get } from "./db";
import {
  DEFAULT_MONTHLY_GRAM_LIMIT,
  monthKey,
  parseGramsPerUnit,
} from "./gram-utils";

export type ComplianceStatus = "ok" | "warn" | "fail" | "pending";
export type AlertLevel = "ok" | "warn" | "critical";
export type RxSource = "internal" | "web_ocr" | "web" | "none";

export interface ComplianceCheckItem {
  id: string;
  label: string;
  status: ComplianceStatus;
  detail: string;
}

export interface PatientComplianceSummary {
  monthlyGramsUsed: number;
  monthlyGramLimit: number;
  monthlyPercent: number;
  daysToRxExpiry: number | null;
  rxExpiryDate: string | null;
  rxDoctorName: string | null;
  rxSource: RxSource;
  webRxStatus: string | null;
  documentsComplete: boolean;
  documentsTotal: number;
  documentsUploaded: number;
  lastDispensationAt: string | null;
  lastWebOrderAt: string | null;
  checks: ComplianceCheckItem[];
  alertLevel: AlertLevel;
}

interface DispensationLineRow {
  quantity: number;
  presentation: string | null;
  name: string;
}

interface WebOrderLineRow {
  quantity: number;
  presentation: string | null;
  name: string;
}

interface InternalRxRow {
  expiry_date: string;
  doctor_name: string;
}

interface AccountRow {
  id: number;
  patient_id: number | null;
  rut: string | null;
  prescription_status: string;
  prescription_url: string | null;
  id_front_url: string | null;
  id_back_url: string | null;
  criminal_record_url: string | null;
  rights_assignment_url: string | null;
  prescription_ocr_data?: unknown;
  created_at: string;
}

interface OcrPayload {
  monthlyGrams?: number | string;
  issueDate?: string;
  doctorName?: string;
}

const DOC_FIELDS = [
  "prescription_url",
  "id_front_url",
  "id_back_url",
  "criminal_record_url",
  "rights_assignment_url",
] as const;

function normalizeRut(rut: string | null | undefined): string | null {
  if (!rut) return null;
  return rut.replace(/\./g, "").replace(/-/g, "").toUpperCase();
}

function parseOcrData(raw: unknown): OcrPayload | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as OcrPayload;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") return raw as OcrPayload;
  return null;
}

function toIsoDateOnly(value: string | Date): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return value.slice(0, 10);
}

function addMonths(isoDate: string, months: number): string {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate;
  d.setMonth(d.getMonth() + months);
  return toIsoDateOnly(d);
}

function daysUntil(isoDate: string | null): number | null {
  if (!isoDate) return null;
  const expiry = new Date(isoDate);
  if (Number.isNaN(expiry.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);
  return Math.ceil((expiry.getTime() - today.getTime()) / 86_400_000);
}

function isRxValid(expiryDate: string | null): boolean {
  const days = daysUntil(expiryDate);
  return days !== null && days >= 0;
}

function countUploadedDocs(account: AccountRow): number {
  return DOC_FIELDS.filter((field) => Boolean(account[field]?.trim())).length;
}

function sumLineGrams(rows: Array<DispensationLineRow | WebOrderLineRow>): number {
  let total = 0;
  for (const row of rows) {
    total += parseGramsPerUnit(row.presentation, row.name, row.quantity);
  }
  return Math.round(total * 100) / 100;
}

function parseMonthlyGramLimit(raw: unknown): number | null {
  const ocr = parseOcrData(raw);
  if (!ocr?.monthlyGrams) return null;
  const n =
    typeof ocr.monthlyGrams === "string"
      ? parseFloat(ocr.monthlyGrams.replace(",", "."))
      : ocr.monthlyGrams;
  return Number.isFinite(n) && n > 0 ? n : null;
}

function pickPrimaryAccount(accounts: AccountRow[], patientId: number): AccountRow | null {
  if (!accounts.length) return null;
  const linked = accounts.filter((a) => a.patient_id === patientId);
  if (linked.length) {
    return [...linked].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )[0];
  }
  return [...accounts].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )[0];
}

async function loadAccounts(accountIds: number[]): Promise<AccountRow[]> {
  if (!accountIds.length) return [];
  const placeholders = accountIds.map(() => "?").join(",");
  try {
    return await all<AccountRow>(
      `SELECT id, patient_id, rut, prescription_status,
         prescription_url, id_front_url, id_back_url, criminal_record_url, rights_assignment_url,
         prescription_ocr_data, created_at
       FROM customer_accounts
       WHERE id IN (${placeholders})
       ORDER BY created_at ASC`,
      ...accountIds
    );
  } catch {
    return await all<AccountRow>(
      `SELECT id, patient_id, rut, prescription_status,
         prescription_url, id_front_url, id_back_url, criminal_record_url, rights_assignment_url,
         created_at
       FROM customer_accounts
       WHERE id IN (${placeholders})
       ORDER BY created_at ASC`,
      ...accountIds
    );
  }
}

function resolveRxFromAccounts(accounts: AccountRow[]): {
  expiryDate: string | null;
  doctorName: string | null;
  source: RxSource;
  webRxStatus: string | null;
} {
  let bestOcrExpiry: string | null = null;
  let bestOcrDoctor: string | null = null;
  let hasWebApproved = false;
  let webRxStatus: string | null = null;

  for (const acc of accounts) {
    if (!webRxStatus || acc.prescription_status !== "none") {
      webRxStatus = acc.prescription_status;
    }
    if (acc.prescription_status === "aprobada") {
      hasWebApproved = true;
    }

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
    return {
      expiryDate: bestOcrExpiry,
      doctorName: bestOcrDoctor,
      source: "web_ocr",
      webRxStatus,
    };
  }

  if (hasWebApproved) {
    return {
      expiryDate: null,
      doctorName: null,
      source: "web",
      webRxStatus,
    };
  }

  return {
    expiryDate: null,
    doctorName: null,
    source: "none",
    webRxStatus,
  };
}

function resolveMonthlyLimit(accounts: AccountRow[], primary: AccountRow | null): number {
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

function buildChecks(params: {
  patientRut: string | null;
  accountRut: string | null;
  hasWebAccount: boolean;
  webRxStatus: string | null;
  rxExpiryDate: string | null;
  monthlyGramsUsed: number;
  monthlyGramLimit: number;
  documentsUploaded: number;
  documentsTotal: number;
}): ComplianceCheckItem[] {
  const checks: ComplianceCheckItem[] = [];
  const daysLeft = daysUntil(params.rxExpiryDate);

  if (params.patientRut && params.accountRut) {
    const match = params.patientRut === params.accountRut;
    checks.push({
      id: "rut_match",
      label: "RUT paciente vs cuenta",
      status: match ? "ok" : "fail",
      detail: match
        ? "El RUT del paciente coincide con la cuenta web."
        : "El RUT del paciente no coincide con la cuenta web.",
    });
  } else {
    checks.push({
      id: "rut_match",
      label: "RUT paciente vs cuenta",
      status: "pending",
      detail: !params.patientRut
        ? "Falta RUT en ficha del paciente."
        : "La cuenta web no tiene RUT registrado.",
    });
  }

  if (params.rxExpiryDate) {
    const valid = isRxValid(params.rxExpiryDate);
    checks.push({
      id: "rx_valid",
      label: "Receta vigente",
      status: valid ? "ok" : "fail",
      detail: valid
        ? `Vigente hasta ${params.rxExpiryDate}.`
        : `Venció el ${params.rxExpiryDate}.`,
    });

    if (valid && daysLeft !== null) {
      checks.push({
        id: "rx_expiring_soon",
        label: "Receta por vencer",
        status: daysLeft < 30 ? "warn" : "ok",
        detail:
          daysLeft < 30
            ? `Vence en ${daysLeft} día${daysLeft === 1 ? "" : "s"}.`
            : `Vigente por ${daysLeft} días más.`,
      });
    }
  } else {
    checks.push({
      id: "rx_valid",
      label: "Receta vigente",
      status: "fail",
      detail: "No hay receta vigente registrada.",
    });
    checks.push({
      id: "rx_expiring_soon",
      label: "Receta por vencer",
      status: "pending",
      detail: "Sin fecha de vencimiento para evaluar.",
    });
  }

  const pct = params.monthlyGramLimit > 0
    ? (params.monthlyGramsUsed / params.monthlyGramLimit) * 100
    : 0;
  let gramsStatus: ComplianceStatus = "ok";
  let gramsDetail = `${params.monthlyGramsUsed} g de ${params.monthlyGramLimit} g (${pct.toFixed(0)}%).`;
  if (params.monthlyGramsUsed > params.monthlyGramLimit) {
    gramsStatus = "fail";
    gramsDetail = `Excede el límite: ${params.monthlyGramsUsed} g de ${params.monthlyGramLimit} g permitidos.`;
  } else if (pct > 80) {
    gramsStatus = "warn";
    gramsDetail = `Cerca del límite: ${params.monthlyGramsUsed} g de ${params.monthlyGramLimit} g (${pct.toFixed(0)}%).`;
  }
  checks.push({
    id: "monthly_grams",
    label: "Gramos mensuales",
    status: gramsStatus,
    detail: gramsDetail,
  });

  const docsOk = params.documentsUploaded >= params.documentsTotal;
  checks.push({
    id: "docs_complete",
    label: "Documentos completos",
    status: docsOk ? "ok" : params.documentsUploaded > 0 ? "warn" : "fail",
    detail: docsOk
      ? "Los 5 documentos requeridos están cargados."
      : `${params.documentsUploaded} de ${params.documentsTotal} documentos cargados.`,
  });

  if (params.hasWebAccount) {
    const approved = params.webRxStatus === "aprobada";
    const rejected = params.webRxStatus === "rechazada";
    const pending = params.webRxStatus === "pending";
    checks.push({
      id: "web_rx_approved",
      label: "Receta web aprobada",
      status: approved ? "ok" : rejected ? "fail" : pending ? "pending" : "fail",
      detail: approved
        ? "Receta web aprobada por QF."
        : rejected
          ? "Receta web rechazada."
          : pending
            ? "Receta web pendiente de revisión QF."
            : "Sin receta web cargada.",
    });
  }

  return checks;
}

function resolveAlertLevel(checks: ComplianceCheckItem[]): AlertLevel {
  const rxFail = checks.some((c) => c.id === "rx_valid" && c.status === "fail");
  const gramsFail = checks.some((c) => c.id === "monthly_grams" && c.status === "fail");
  if (rxFail || gramsFail) return "critical";

  if (checks.some((c) => c.status === "warn")) return "warn";
  return "ok";
}

export async function loadPatientCompliance(
  patientId: number,
  accountIds: number[]
): Promise<PatientComplianceSummary> {
  const now = new Date();
  const currentMonth = monthKey(now);

  const patient = await get<{ rut: string }>(`SELECT rut FROM patients WHERE id = ?`, patientId);
  const patientRut = normalizeRut(patient?.rut);

  const dispLines = await all<DispensationLineRow>(
    `SELECT di.quantity, pr.presentation, pr.name
     FROM dispensation_items di
     JOIN dispensations d ON d.id = di.dispensation_id
     JOIN products pr ON pr.id = di.product_id
     WHERE d.patient_id = ?
       AND d.status = 'completed'
       AND TO_CHAR(d.dispensed_at, 'YYYY-MM') = ?`,
    patientId,
    currentMonth
  );

  let webLines: WebOrderLineRow[] = [];
  if (accountIds.length > 0) {
    const placeholders = accountIds.map(() => "?").join(",");
    webLines = await all<WebOrderLineRow>(
      `SELECT coi.quantity, pr.presentation, pr.name
       FROM customer_order_items coi
       JOIN customer_orders co ON co.id = coi.order_id
       JOIN products pr ON pr.id = coi.product_id
       WHERE co.customer_account_id IN (${placeholders})
         AND co.status NOT IN ('cancelled', 'rejected')
         AND TO_CHAR(co.created_at, 'YYYY-MM') = ?`,
      ...accountIds,
      currentMonth
    );
  }

  const monthlyGramsUsed = sumLineGrams([...dispLines, ...webLines]);

  const accounts = await loadAccounts(accountIds);
  const primaryAccount = pickPrimaryAccount(accounts, patientId);
  const monthlyGramLimit = resolveMonthlyLimit(accounts, primaryAccount);
  const monthlyPercent =
    monthlyGramLimit > 0
      ? Math.round((monthlyGramsUsed / monthlyGramLimit) * 1000) / 10
      : 0;

  const internalRx = await get<InternalRxRow>(
    `SELECT r.expiry_date, d.full_name as doctor_name
     FROM prescriptions r
     JOIN doctors d ON d.id = r.doctor_id
     WHERE r.patient_id = ? AND r.status = 'active'
     ORDER BY r.expiry_date DESC
     LIMIT 1`,
    patientId
  );

  const webRx = resolveRxFromAccounts(accounts);

  let rxExpiryDate: string | null = null;
  let rxDoctorName: string | null = null;
  let rxSource: RxSource = "none";

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

  const documentsTotal = DOC_FIELDS.length;
  const documentsUploaded = primaryAccount ? countUploadedDocs(primaryAccount) : 0;
  const documentsComplete = documentsUploaded >= documentsTotal;

  const lastDispensation = await get<{ dispensed_at: string }>(
    `SELECT dispensed_at
     FROM dispensations
     WHERE patient_id = ? AND status = 'completed'
     ORDER BY dispensed_at DESC
     LIMIT 1`,
    patientId
  );

  let lastWebOrderAt: string | null = null;
  if (accountIds.length > 0) {
    const placeholders = accountIds.map(() => "?").join(",");
    const lastWebOrder = await get<{ created_at: string }>(
      `SELECT created_at
       FROM customer_orders
       WHERE customer_account_id IN (${placeholders})
         AND status NOT IN ('cancelled', 'rejected')
       ORDER BY created_at DESC
       LIMIT 1`,
      ...accountIds
    );
    lastWebOrderAt = lastWebOrder?.created_at ?? null;
  }

  const checks = buildChecks({
    patientRut,
    accountRut: normalizeRut(primaryAccount?.rut),
    hasWebAccount: accountIds.length > 0,
    webRxStatus: webRx.webRxStatus,
    rxExpiryDate,
    monthlyGramsUsed,
    monthlyGramLimit,
    documentsUploaded,
    documentsTotal,
  });

  return {
    monthlyGramsUsed,
    monthlyGramLimit,
    monthlyPercent,
    daysToRxExpiry: daysUntil(rxExpiryDate),
    rxExpiryDate,
    rxDoctorName,
    rxSource,
    webRxStatus: webRx.webRxStatus,
    documentsComplete,
    documentsTotal,
    documentsUploaded,
    lastDispensationAt: lastDispensation?.dispensed_at ?? null,
    lastWebOrderAt,
    checks,
    alertLevel: resolveAlertLevel(checks),
  };
}