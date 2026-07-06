// Cron diario: pedidos en pending_payment hace más de 24h (y menos de 7 días)
// reciben UN recordatorio con los datos de transferencia y link para retomar.
// Transaccional (es sobre SU pedido) — no respeta opt-out, pero dedupe = 1 por orden.
import { NextResponse, type NextRequest } from "next/server";
import { all } from "@/lib/db";
import { sendNotification } from "@/lib/notify";
import { formatCLP } from "@/lib/format";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const expectedCron = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
  const expectedManual = process.env.MIGRATION_SECRET ? `Bearer ${process.env.MIGRATION_SECRET}` : null;
  if (auth !== expectedCron && auth !== expectedManual) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const abandoned = await all<{
    order_id: number; folio: string; total: number; account_id: number;
    email: string; phone: string | null; full_name: string;
  }>(
    `SELECT o.id as order_id, o.folio, o.total, c.id as account_id,
       c.email, c.phone, c.full_name
     FROM customer_orders o
     JOIN customer_accounts c ON c.id = o.customer_account_id
     WHERE o.status = 'pending_payment'
       AND o.created_at < NOW() - INTERVAL '24 hours'
       AND o.created_at > NOW() - INTERVAL '7 days'`
  );

  let attempted = 0;
  for (const o of abandoned) {
    attempted++;
    await sendNotification({
      type: "pedido_abandonado",
      customerAccountId: o.account_id,
      recipientEmail: o.email,
      recipientPhone: o.phone,
      dedupeKey: String(o.order_id),
      relatedId: o.order_id,
      data: {
        firstName: o.full_name,
        folio: o.folio,
        totalCLP: formatCLP(Number(o.total)),
        orderId: o.order_id,
      },
    });
  }

  return NextResponse.json({ ok: true, candidates: abandoned.length, attempted });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
