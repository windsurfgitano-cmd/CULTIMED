import { get, all } from "./db";
import { loadPatientCompliance } from "./patient-compliance";
import { parseGramsPerUnit } from "./gram-utils";

export interface DispensationCartItem {
  presentation: string | null;
  name: string;
  quantity: number;
}

export interface DispensationGuardResult {
  allowed: boolean;
  blocked: boolean;
  reasons: string[];
  warnings: string[];
  cartGrams: number;
  projectedMonthlyGrams: number;
  monthlyLimit: number;
}

export async function validateDispensation(params: {
  patientId: number;
  items: DispensationCartItem[];
  prescriptionId?: number | null;
  allowOverride?: boolean;
}): Promise<DispensationGuardResult> {
  const { patientId, items, prescriptionId, allowOverride = false } = params;
  const reasons: string[] = [];
  const warnings: string[] = [];

  const patient = await get<{ membership_status: string; full_name: string }>(
    `SELECT membership_status, full_name FROM patients WHERE id = ?`,
    patientId
  );
  if (!patient) {
    return {
      allowed: false,
      blocked: true,
      reasons: ["Paciente no encontrado."],
      warnings: [],
      cartGrams: 0,
      projectedMonthlyGrams: 0,
      monthlyLimit: 30,
    };
  }

  if (patient.membership_status === "deleted") {
    reasons.push("El perfil del paciente está eliminado.");
  }
  if (patient.membership_status === "suspended") {
    reasons.push("Membresía suspendida — no se puede dispensar.");
  }
  if (patient.membership_status === "pending") {
    warnings.push("Membresía pendiente — verifica datos del paciente.");
  }

  const accounts = await all<{ id: number }>(
    `SELECT id FROM customer_accounts WHERE patient_id = ?`,
    patientId
  );
  let accountIds = accounts.map((a) => a.id);

  if (!accountIds.length) {
    const p = await get<{ rut: string | null; email: string | null }>(
      `SELECT rut, email FROM patients WHERE id = ?`,
      patientId
    );
    const rutNorm = p?.rut?.replace(/\./g, "").replace(/-/g, "").toUpperCase() || "";
    const emailNorm = p?.email?.trim().toLowerCase() || "";
    const matched = await all<{ id: number }>(
      `SELECT id FROM customer_accounts
       WHERE patient_id IS NULL
         AND (
           (${rutNorm} <> '' AND REPLACE(REPLACE(UPPER(rut), '.', ''), '-', '') = ?)
           OR (${emailNorm} <> '' AND LOWER(email) = ?)
         )`,
      rutNorm,
      emailNorm
    );
    accountIds = matched.map((a) => a.id);
  }

  const compliance = await loadPatientCompliance(patientId, accountIds);

  const rxValid = compliance.checks.find((c) => c.id === "rx_valid");
  const webApproved = compliance.checks.find((c) => c.id === "web_rx_approved");

  const hasValidRx = rxValid?.status === "ok" || webApproved?.status === "ok";

  if (!hasValidRx) {
    if (rxValid?.status === "fail") {
      reasons.push(rxValid.detail || "Receta no vigente.");
    } else if (webApproved?.status === "fail" || webApproved?.status === "pending") {
      reasons.push(webApproved.detail || "Receta web no aprobada.");
    } else {
      reasons.push("No hay receta vigente ni receta web aprobada.");
    }
  }

  const rxExpiring = compliance.checks.find((c) => c.id === "rx_expiring_soon");
  if (rxExpiring?.status === "warn") {
    warnings.push(rxExpiring.detail);
  }

  if (prescriptionId) {
    const rx = await get<{ expiry_date: string; status: string }>(
      `SELECT expiry_date, status FROM prescriptions WHERE id = ? AND patient_id = ?`,
      prescriptionId,
      patientId
    );
    if (!rx) {
      reasons.push("La receta seleccionada no pertenece a este paciente.");
    } else if (rx.status !== "active") {
      reasons.push("La receta seleccionada no está activa.");
    } else if (new Date(rx.expiry_date) < new Date()) {
      reasons.push(`La receta seleccionada venció el ${rx.expiry_date}.`);
    }
  }

  const cartGrams = items.reduce(
    (sum, it) => sum + parseGramsPerUnit(it.presentation, it.name, it.quantity),
    0
  );
  const projectedMonthlyGrams =
    Math.round((compliance.monthlyGramsUsed + cartGrams) * 100) / 100;

  if (projectedMonthlyGrams > compliance.monthlyGramLimit) {
    reasons.push(
      `Excede cupo mensual: ${projectedMonthlyGrams} g proyectados de ${compliance.monthlyGramLimit} g permitidos (carrito + ${compliance.monthlyGramsUsed} g ya dispensados/pedidos este mes).`
    );
  } else if (compliance.monthlyGramsUsed >= compliance.monthlyGramLimit && cartGrams > 0) {
    reasons.push(
      `Cupo mensual agotado: ${compliance.monthlyGramsUsed} g de ${compliance.monthlyGramLimit} g.`
    );
  }

  const gramsCheck = compliance.checks.find((c) => c.id === "monthly_grams");
  if (gramsCheck?.status === "fail" && cartGrams === 0) {
    warnings.push(gramsCheck.detail);
  }

  const docsCheck = compliance.checks.find((c) => c.id === "docs_complete");
  if (docsCheck && docsCheck.status !== "ok") {
    warnings.push(docsCheck.detail);
  }

  const blocked = reasons.length > 0 && !allowOverride;
  const allowed = reasons.length === 0 || allowOverride;

  return {
    allowed,
    blocked,
    reasons,
    warnings,
    cartGrams,
    projectedMonthlyGrams,
    monthlyLimit: compliance.monthlyGramLimit,
  };
}