// Cron diario: recordatorio de recompra. Pacientes cuyo ÚLTIMO pedido pagado
// fue hace ≥5 días y no han vuelto a comprar. Marketing → respeta
// marketing_opt_out e incluye link de baja. Dedupe: 1 email por orden gatillo.
// Auth idéntica a los crons existentes (CRON_SECRET / MIGRATION_SECRET).
import { NextResponse, type NextRequest } from "next/server";
import { all } from "@/lib/db";
import { sendNotification } from "@/lib/notify";
import { makeUnsubscribeToken } from "@/lib/notify-utils";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const REPURCHASE_DAYS = 5;
const STORE_BASE = process.env.STORE_PUBLIC_BASE || process.env.NEXT_PUBLIC_BASE_URL || "https://dispensariocultimed.cl";
const PAID_STATUSES = ["paid", "preparing", "ready_for_pickup", "shipped", "delivered"];

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const expectedCron = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
  const expectedManual = process.env.MIGRATION_SECRET ? `Bearer ${process.env.MIGRATION_SECRET}` : null;
  if (auth !== expectedCron && auth !== expectedManual) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Última orden pagada por cliente; candidata si tiene ≥5 días y no hay orden
  // posterior (de cualquier estado no cancelado) del mismo cliente.
  const candidates = await all<{
    order_id: number; account_id: number; email: string; phone: string | null; full_name: string;
  }>(
    `WITH last_paid AS (
       SELECT DISTINCT ON (o.customer_account_id)
         o.id as order_id, o.customer_account_id as account_id, o.created_at,
         c.email, c.phone, c.full_name
       FROM customer_orders o
       JOIN customer_accounts c ON c.id = o.customer_account_id
       WHERE o.status IN ('paid','preparing','ready_for_pickup','shipped','delivered')
         AND c.marketing_opt_out = false
       ORDER BY o.customer_account_id, o.created_at DESC
     )
     SELECT lp.order_id, lp.account_id, lp.email, lp.phone, lp.full_name
     FROM last_paid lp
     WHERE lp.created_at < NOW() - INTERVAL '${REPURCHASE_DAYS} days'
       AND NOT EXISTS (
         SELECT 1 FROM customer_orders o2
         WHERE o2.customer_account_id = lp.account_id
           AND o2.created_at > lp.created_at
           AND o2.status != 'cancelled'
       )`
  );

  let attempted = 0;
  for (const c of candidates) {
    attempted++;
    await sendNotification({
      type: "recompra",
      customerAccountId: c.account_id,
      recipientEmail: c.email,
      recipientPhone: c.phone,
      dedupeKey: String(c.order_id),
      relatedId: c.order_id,
      data: {
        firstName: c.full_name,
        unsubscribeUrl: `${STORE_BASE}/baja?t=${makeUnsubscribeToken(c.account_id)}`,
      },
    });
  }

  return NextResponse.json({ ok: true, candidates: candidates.length, attempted });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
