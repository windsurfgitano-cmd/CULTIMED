// Programa de Embajadores Cultimed
// — 10% del valor neto de la primera dispensación del referido
// — 1% de cada dispensación posterior por 12 meses
// — Pago vía transferencia bancaria mensual (umbral mínimo $20.000)
// — 5% off al referido en su primera compra
// — Solo cuentas con receta aprobada pueden ser embajadores
// — Cap mensual sugerido por embajador: $300.000 (no auto-enforced, alerta admin)

import crypto from "node:crypto";
import { all, get, run, transaction } from "./db";

export const REFERRAL_COOKIE_NAME = "cultimed_ref";
export const REFERRAL_COOKIE_DAYS = 60;

// Comisiones (basis points: 10000 = 100%)
export const FIRST_ORDER_RATE_BPS = 1000;       // 10%
export const HISTORICAL_RATE_BPS = 100;         // 1%
export const REFERRED_DISCOUNT_BPS = 500;       // 5% off al referido en primera compra
export const RESIDUAL_WINDOW_DAYS = 365;        // 12 meses
export const MIN_PAYOUT_AMOUNT = 20_000;        // $20.000 CLP umbral
export const MONTHLY_CAP_PER_AMBASSADOR = 300_000; // alerta, no enforced

// ---- Utilidades ----------------------------------------------------------

/** Genera un código corto, legible, único. Formato: 6 chars alfanuméricos sin caracteres ambiguos. */
export function generateReferralCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O/1/I
  const bytes = crypto.randomBytes(6);
  let code = "";
  for (let i = 0; i < 6; i++) code += alphabet[bytes[i] % alphabet.length];
  return code;
}

// ---- Modelo --------------------------------------------------------------

export interface ReferralCode {
  id: number;
  ambassador_account_id: number;
  code: string;
  is_active: number;
  created_at: string;
}

export interface ReferralConversion {
  id: number;
  code_id: number;
  ambassador_account_id: number;
  referred_account_id: number;
  registered_at: string;
  prescription_approved_at: string | null;
  first_order_id: number | null;
  first_order_paid_at: string | null;
  expires_at: string | null;
  status: "pending" | "active" | "converted" | "expired" | "cancelled";
  cancelled_reason: string | null;
}

export interface AmbassadorBankInfo {
  ambassador_account_id: number;
  bank_name: string;
  account_type: "corriente" | "vista" | "rut" | "ahorro";
  account_number: string;
  account_holder_name: string;
  account_holder_rut: string;
  contact_email: string | null;
  updated_at: string;
}

// ---- Embajador: getter / setter -----------------------------------------

/** Devuelve (o crea) el código de referido del embajador. Solo se permite si su receta está aprobada. */
export function getOrCreateReferralCode(accountId: number): ReferralCode | null {
  const acc = get<{ prescription_status: string }>(
    `SELECT prescription_status FROM customer_accounts WHERE id = ?`,
    accountId
  );
  if (!acc || acc.prescription_status !== "aprobada") return null;

  const existing = get<ReferralCode>(
    `SELECT * FROM referral_codes WHERE ambassador_account_id = ?`,
    accountId
  );
  if (existing) return existing;

  // Generar código único (loop con 5 intentos máx).
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode();
    const collision = get<{ id: number }>(`SELECT id FROM referral_codes WHERE code = ?`, code);
    if (collision) continue;
    const r = run(
      `INSERT INTO referral_codes (ambassador_account_id, code) VALUES (?, ?)`,
      accountId, code
    );
    return get<ReferralCode>(`SELECT * FROM referral_codes WHERE id = ?`, r.lastInsertRowid)!;
  }
  return null;
}

/** Encuentra un código activo por su string. */
export function findActiveCode(code: string): ReferralCode | null {
  const c = (code || "").toUpperCase().trim();
  if (!c) return null;
  return get<ReferralCode>(
    `SELECT * FROM referral_codes WHERE code = ? AND is_active = 1`, c
  ) || null;
}

// ---- Tracking de conversión ---------------------------------------------

/**
 * Registra la conversión cuando un nuevo paciente se registra usando un código.
 * Anti-fraude: bloquea auto-referral (mismo account ID) y referral cruzado.
 */
export function attachReferralOnRegister(opts: {
  newAccountId: number;
  refCode: string;
}): ReferralConversion | null {
  const code = findActiveCode(opts.refCode);
  if (!code) return null;
  if (code.ambassador_account_id === opts.newAccountId) return null; // self-refer

  // ¿Ya existe conversión para este referred_account_id? (Único)
  const existing = get<ReferralConversion>(
    `SELECT * FROM referral_conversions WHERE referred_account_id = ?`,
    opts.newAccountId
  );
  if (existing) return existing;

  // Anti referral cruzado: si el embajador tiene a su vez una conversión
  // donde fue referido por la cuenta nueva, bloquear.
  const cross = get<{ id: number }>(
    `SELECT id FROM referral_conversions
     WHERE ambassador_account_id = ? AND referred_account_id = ?`,
    opts.newAccountId, code.ambassador_account_id
  );
  if (cross) return null;

  const r = run(
    `INSERT INTO referral_conversions
       (code_id, ambassador_account_id, referred_account_id, status)
     VALUES (?, ?, ?, 'pending')`,
    code.id, code.ambassador_account_id, opts.newAccountId
  );
  return get<ReferralConversion>(
    `SELECT * FROM referral_conversions WHERE id = ?`, r.lastInsertRowid
  )!;
}

/** Llamado cuando QF aprueba la receta del referido. */
export function markPrescriptionApproved(referredAccountId: number): void {
  run(
    `UPDATE referral_conversions
     SET prescription_approved_at = CURRENT_TIMESTAMP,
         status = CASE WHEN status = 'pending' THEN 'active' ELSE status END
     WHERE referred_account_id = ? AND status IN ('pending', 'active')`,
    referredAccountId
  );
}

/** Devuelve la conversión "activa" del referido (si tiene una y aún no se ejecutó primera compra). */
export function getActiveConversionForReferred(referredAccountId: number): ReferralConversion | null {
  return get<ReferralConversion>(
    `SELECT * FROM referral_conversions
     WHERE referred_account_id = ? AND status IN ('pending', 'active')`,
    referredAccountId
  ) || null;
}

/** Conversión vigente para cálculo histórico (1%) — sólo si converted y dentro de ventana. */
export function getResidualConversionForReferred(referredAccountId: number): ReferralConversion | null {
  return get<ReferralConversion>(
    `SELECT * FROM referral_conversions
     WHERE referred_account_id = ?
       AND status = 'converted'
       AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`,
    referredAccountId
  ) || null;
}

/**
 * Llamado cuando un pedido del referido pasa a `payment_confirmed` (decisión D5).
 * - Si es la primera compra de un referido con conversión activa: registra comisión 10%, marca converted.
 * - Si ya estaba converted y el pedido es posterior: registra comisión 1% si dentro de ventana 12m.
 *
 * Idempotente: usa UNIQUE(order_id, type) para evitar doble cálculo.
 *
 * @param orderId el id del customer_order que pasó a payment_confirmed
 */
export function recordCommissionForOrder(orderId: number): { type: "first" | "historical" | null; amount: number } {
  const order = get<{
    id: number;
    customer_account_id: number;
    subtotal: number;
    total: number;
    referral_discount_amount: number;
    status: string;
  }>(
    `SELECT id, customer_account_id, subtotal, total, referral_discount_amount, status
     FROM customer_orders WHERE id = ?`,
    orderId
  );
  if (!order) return { type: null, amount: 0 };

  // Solo calculamos al confirmar pago (D5: comisión firme una vez pagado el pedido).
  if (!["paid", "preparing", "ready_for_pickup", "shipped", "delivered"].includes(order.status)) {
    return { type: null, amount: 0 };
  }

  // Base: subtotal (excluye despacho, IVA, ajustes manuales — D4).
  // Si el referido tuvo descuento del 5%, ese descuento se le aplicó a él, no afecta la base bruta del pedido
  // sobre la cual se calcula la comisión del embajador. Decisión: usar el subtotal después del 5% off,
  // así pagamos comisión sobre lo realmente percibido por Cultimed (consistente).
  const baseAmount = Math.max(0, order.subtotal - (order.referral_discount_amount || 0));

  return transaction(() => {
    // ¿Es primera compra de un referido?
    const conv = get<ReferralConversion>(
      `SELECT * FROM referral_conversions
       WHERE referred_account_id = ? AND status IN ('active', 'converted')`,
      order.customer_account_id
    );
    if (!conv) return { type: null, amount: 0 };

    // Caso 1: aún no convertido → primera comisión 10%
    if (conv.status === "active" && !conv.first_order_id) {
      const amount = Math.round((baseAmount * FIRST_ORDER_RATE_BPS) / 10000);

      // Marcar conversión como converted, fijar expires_at y first_order_*
      run(
        `UPDATE referral_conversions
         SET first_order_id = ?,
             first_order_paid_at = CURRENT_TIMESTAMP,
             expires_at = datetime(CURRENT_TIMESTAMP, '+${RESIDUAL_WINDOW_DAYS} days'),
             status = 'converted'
         WHERE id = ?`,
        orderId, conv.id
      );

      // Insertar comisión first (UNIQUE(order_id,type) protege re-llamadas)
      try {
        run(
          `INSERT INTO referral_commissions
             (conversion_id, ambassador_account_id, order_id, type, base_amount, rate_bps, amount, status)
           VALUES (?, ?, ?, 'first', ?, ?, ?, 'pending')`,
          conv.id, conv.ambassador_account_id, orderId, baseAmount, FIRST_ORDER_RATE_BPS, amount
        );
      } catch (e) {
        // Ya existía (idempotente)
      }
      return { type: "first", amount };
    }

    // Caso 2: ya convertido → 1% historical si está vigente y no es el primer pedido
    if (conv.status === "converted" && conv.first_order_id !== orderId) {
      const stillValid = get<{ valid: number }>(
        `SELECT (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP) AS valid
         FROM referral_conversions WHERE id = ?`, conv.id
      );
      if (!stillValid?.valid) return { type: null, amount: 0 };

      const amount = Math.round((baseAmount * HISTORICAL_RATE_BPS) / 10000);
      try {
        run(
          `INSERT INTO referral_commissions
             (conversion_id, ambassador_account_id, order_id, type, base_amount, rate_bps, amount, status)
           VALUES (?, ?, ?, 'historical', ?, ?, ?, 'pending')`,
          conv.id, conv.ambassador_account_id, orderId, baseAmount, HISTORICAL_RATE_BPS, amount
        );
      } catch (e) {
        // Ya existía (idempotente)
      }
      return { type: "historical", amount };
    }

    return { type: null, amount: 0 };
  });
}

// ---- Datos bancarios ----------------------------------------------------

export function upsertBankInfo(input: AmbassadorBankInfo): void {
  run(
    `INSERT INTO ambassador_bank_info
       (ambassador_account_id, bank_name, account_type, account_number,
        account_holder_name, account_holder_rut, contact_email, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(ambassador_account_id) DO UPDATE SET
       bank_name = excluded.bank_name,
       account_type = excluded.account_type,
       account_number = excluded.account_number,
       account_holder_name = excluded.account_holder_name,
       account_holder_rut = excluded.account_holder_rut,
       contact_email = excluded.contact_email,
       updated_at = CURRENT_TIMESTAMP`,
    input.ambassador_account_id,
    input.bank_name,
    input.account_type,
    input.account_number,
    input.account_holder_name,
    input.account_holder_rut,
    input.contact_email || null
  );
}

export function getBankInfo(accountId: number): AmbassadorBankInfo | null {
  return get<AmbassadorBankInfo>(
    `SELECT * FROM ambassador_bank_info WHERE ambassador_account_id = ?`,
    accountId
  ) || null;
}

// ---- Métricas dashboard embajador ---------------------------------------

export interface AmbassadorStats {
  totalInvited: number;
  totalActive: number;          // recetas aprobadas
  totalConverted: number;       // primer pedido pagado
  pendingAmount: number;        // comisión pending (sin pagar)
  paidAmount: number;           // comisión paid
  voidedAmount: number;
  totalCommission: number;      // pending + paid
  monthCommissionAmount: number; // este mes calendario
  monthCapAmount: number;        // cap mensual sugerido
  conversions: Array<ReferralConversion & {
    referred_email_masked: string;
    first_order_total: number | null;
  }>;
}

function maskEmail(email: string): string {
  const [u, d] = email.split("@");
  if (!u || !d) return "—";
  return `${u[0]}***@${d}`;
}

export function getAmbassadorStats(ambassadorAccountId: number): AmbassadorStats {
  const code = get<ReferralCode>(
    `SELECT * FROM referral_codes WHERE ambassador_account_id = ?`, ambassadorAccountId
  );

  const conversions = code ? all<ReferralConversion & { referred_email: string; first_order_total: number | null }>(
    `SELECT rc.*, ca.email as referred_email,
       (SELECT total FROM customer_orders WHERE id = rc.first_order_id) as first_order_total
     FROM referral_conversions rc
     JOIN customer_accounts ca ON ca.id = rc.referred_account_id
     WHERE rc.ambassador_account_id = ?
     ORDER BY rc.registered_at DESC`,
    ambassadorAccountId
  ) : [];

  const pendingAmount = get<{ s: number }>(
    `SELECT COALESCE(SUM(amount), 0) AS s FROM referral_commissions
     WHERE ambassador_account_id = ? AND status = 'pending'`, ambassadorAccountId
  )?.s || 0;
  const paidAmount = get<{ s: number }>(
    `SELECT COALESCE(SUM(amount), 0) AS s FROM referral_commissions
     WHERE ambassador_account_id = ? AND status = 'paid'`, ambassadorAccountId
  )?.s || 0;
  const voidedAmount = get<{ s: number }>(
    `SELECT COALESCE(SUM(amount), 0) AS s FROM referral_commissions
     WHERE ambassador_account_id = ? AND status = 'voided'`, ambassadorAccountId
  )?.s || 0;
  const monthCommissionAmount = get<{ s: number }>(
    `SELECT COALESCE(SUM(amount), 0) AS s FROM referral_commissions
     WHERE ambassador_account_id = ?
       AND status IN ('pending', 'paid')
       AND strftime('%Y-%m', generated_at) = strftime('%Y-%m', CURRENT_TIMESTAMP)`,
    ambassadorAccountId
  )?.s || 0;

  return {
    totalInvited: conversions.length,
    totalActive: conversions.filter(c => c.status === "active" || c.status === "converted").length,
    totalConverted: conversions.filter(c => c.status === "converted").length,
    pendingAmount,
    paidAmount,
    voidedAmount,
    totalCommission: pendingAmount + paidAmount,
    monthCommissionAmount,
    monthCapAmount: MONTHLY_CAP_PER_AMBASSADOR,
    conversions: conversions.map(c => ({
      ...c,
      referred_email_masked: maskEmail(c.referred_email),
    })),
  };
}

// ---- Admin: payouts mensuales -------------------------------------------

/**
 * Crea un payout para un embajador con todas sus comisiones pending.
 * Solo si el total >= MIN_PAYOUT_AMOUNT.
 * Retorna el payout creado o null si no aplica.
 */
export function createPayoutForAmbassador(
  ambassadorAccountId: number,
  staffId: number
): { id: number; total: number } | null {
  const totals = get<{ total: number; min_d: string; max_d: string }>(
    `SELECT COALESCE(SUM(amount), 0) AS total,
       MIN(generated_at) AS min_d, MAX(generated_at) AS max_d
     FROM referral_commissions
     WHERE ambassador_account_id = ? AND status = 'pending'`,
    ambassadorAccountId
  );
  if (!totals || totals.total < MIN_PAYOUT_AMOUNT) return null;

  return transaction(() => {
    const r = run(
      `INSERT INTO referral_payouts
         (ambassador_account_id, period_start, period_end, total_amount, status)
       VALUES (?, ?, ?, ?, 'pending')`,
      ambassadorAccountId,
      totals.min_d,
      totals.max_d,
      totals.total
    );
    const payoutId = Number(r.lastInsertRowid);

    run(
      `UPDATE referral_commissions
       SET payout_id = ?
       WHERE ambassador_account_id = ? AND status = 'pending'`,
      payoutId, ambassadorAccountId
    );

    return { id: payoutId, total: totals.total };
  });
}

export function markPayoutPaid(opts: {
  payoutId: number;
  staffId: number;
  bankReference?: string;
  notes?: string;
}): void {
  transaction(() => {
    run(
      `UPDATE referral_payouts
       SET status = 'paid',
           paid_at = CURRENT_TIMESTAMP,
           paid_by = ?,
           bank_reference = ?,
           notes = ?
       WHERE id = ?`,
      opts.staffId, opts.bankReference || null, opts.notes || null, opts.payoutId
    );
    run(
      `UPDATE referral_commissions
       SET status = 'paid'
       WHERE payout_id = ?`,
      opts.payoutId
    );
  });
}

// ---- Admin: leaderboard --------------------------------------------------

export interface LeaderboardRow {
  ambassador_account_id: number;
  ambassador_name: string | null;
  ambassador_email: string;
  code: string;
  invited: number;
  converted: number;
  total_commission: number;
  pending_commission: number;
  paid_commission: number;
  this_month_commission: number;
  has_bank_info: number;
}

export function getLeaderboard(): LeaderboardRow[] {
  return all<LeaderboardRow>(
    `SELECT
       rc.ambassador_account_id,
       ca.full_name AS ambassador_name,
       ca.email AS ambassador_email,
       rc.code,
       (SELECT COUNT(*) FROM referral_conversions WHERE ambassador_account_id = rc.ambassador_account_id) AS invited,
       (SELECT COUNT(*) FROM referral_conversions
         WHERE ambassador_account_id = rc.ambassador_account_id AND status = 'converted') AS converted,
       (SELECT COALESCE(SUM(amount), 0) FROM referral_commissions
         WHERE ambassador_account_id = rc.ambassador_account_id AND status IN ('pending', 'paid')) AS total_commission,
       (SELECT COALESCE(SUM(amount), 0) FROM referral_commissions
         WHERE ambassador_account_id = rc.ambassador_account_id AND status = 'pending') AS pending_commission,
       (SELECT COALESCE(SUM(amount), 0) FROM referral_commissions
         WHERE ambassador_account_id = rc.ambassador_account_id AND status = 'paid') AS paid_commission,
       (SELECT COALESCE(SUM(amount), 0) FROM referral_commissions
         WHERE ambassador_account_id = rc.ambassador_account_id
           AND status IN ('pending','paid')
           AND strftime('%Y-%m', generated_at) = strftime('%Y-%m', CURRENT_TIMESTAMP)) AS this_month_commission,
       (SELECT 1 FROM ambassador_bank_info WHERE ambassador_account_id = rc.ambassador_account_id) AS has_bank_info
     FROM referral_codes rc
     JOIN customer_accounts ca ON ca.id = rc.ambassador_account_id
     WHERE rc.is_active = 1
     ORDER BY total_commission DESC, invited DESC`
  );
}

// ---- Anti-fraude / utilidades admin -------------------------------------

export function cancelConversion(conversionId: number, reason: string): void {
  transaction(() => {
    run(
      `UPDATE referral_conversions
       SET status = 'cancelled', cancelled_reason = ?
       WHERE id = ?`,
      reason, conversionId
    );
    run(
      `UPDATE referral_commissions
       SET status = 'voided'
       WHERE conversion_id = ? AND status = 'pending'`,
      conversionId
    );
  });
}
