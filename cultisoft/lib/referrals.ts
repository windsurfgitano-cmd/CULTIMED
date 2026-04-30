// Programa de Embajadores Cultimed — hooks usados desde el admin (cultisoft)
// Espejo simplificado de cultimed-store/lib/referrals.ts.
// Comparte la misma BD SQLite.

import { all, get, run, transaction } from "./db";

export const FIRST_ORDER_RATE_BPS = 1000; // 10%
export const HISTORICAL_RATE_BPS = 100;   // 1%
export const RESIDUAL_WINDOW_DAYS = 365;
export const MIN_PAYOUT_AMOUNT = 20_000;
export const MONTHLY_CAP_PER_AMBASSADOR = 300_000;

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

/** Llamado desde el admin cuando QF aprueba la receta del referido. */
export function markPrescriptionApproved(referredAccountId: number): void {
  run(
    `UPDATE referral_conversions
     SET prescription_approved_at = CURRENT_TIMESTAMP,
         status = CASE WHEN status = 'pending' THEN 'active' ELSE status END
     WHERE referred_account_id = ? AND status IN ('pending', 'active')`,
    referredAccountId
  );
}

/** Llamado desde el admin al confirmar pago del pedido — calcula comisión 10% o 1% según corresponda. */
export function recordCommissionForOrder(orderId: number): { type: "first" | "historical" | null; amount: number } {
  const order = get<{
    id: number;
    customer_account_id: number;
    subtotal: number;
    total: number;
    referral_discount_amount: number;
    status: string;
  }>(
    `SELECT id, customer_account_id, subtotal, total,
       COALESCE(referral_discount_amount, 0) AS referral_discount_amount,
       status
     FROM customer_orders WHERE id = ?`,
    orderId
  );
  if (!order) return { type: null, amount: 0 };
  if (!["paid", "preparing", "ready_for_pickup", "shipped", "delivered"].includes(order.status)) {
    return { type: null, amount: 0 };
  }

  const baseAmount = Math.max(0, order.subtotal - (order.referral_discount_amount || 0));

  return transaction(() => {
    const conv = get<ReferralConversion>(
      `SELECT * FROM referral_conversions
       WHERE referred_account_id = ? AND status IN ('active', 'converted')`,
      order.customer_account_id
    );
    if (!conv) return { type: null, amount: 0 };

    if (conv.status === "active" && !conv.first_order_id) {
      const amount = Math.round((baseAmount * FIRST_ORDER_RATE_BPS) / 10000);
      run(
        `UPDATE referral_conversions
         SET first_order_id = ?,
             first_order_paid_at = CURRENT_TIMESTAMP,
             expires_at = datetime(CURRENT_TIMESTAMP, '+${RESIDUAL_WINDOW_DAYS} days'),
             status = 'converted'
         WHERE id = ?`,
        orderId, conv.id
      );
      try {
        run(
          `INSERT INTO referral_commissions
             (conversion_id, ambassador_account_id, order_id, type, base_amount, rate_bps, amount, status)
           VALUES (?, ?, ?, 'first', ?, ?, ?, 'pending')`,
          conv.id, conv.ambassador_account_id, orderId, baseAmount, FIRST_ORDER_RATE_BPS, amount
        );
      } catch (e) { /* idempotente */ }
      return { type: "first", amount };
    }

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
      } catch (e) { /* idempotente */ }
      return { type: "historical", amount };
    }

    return { type: null, amount: 0 };
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
      ambassadorAccountId, totals.min_d, totals.max_d, totals.total
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
       SET status = 'paid', paid_at = CURRENT_TIMESTAMP,
           paid_by = ?, bank_reference = ?, notes = ?
       WHERE id = ?`,
      opts.staffId, opts.bankReference || null, opts.notes || null, opts.payoutId
    );
    run(
      `UPDATE referral_commissions SET status = 'paid' WHERE payout_id = ?`,
      opts.payoutId
    );
  });
}

export function cancelConversion(conversionId: number, reason: string): void {
  transaction(() => {
    run(`UPDATE referral_conversions SET status = 'cancelled', cancelled_reason = ? WHERE id = ?`,
      reason, conversionId);
    run(`UPDATE referral_commissions SET status = 'voided'
         WHERE conversion_id = ? AND status = 'pending'`, conversionId);
  });
}
