// MercadoPago Webhook handler.
// Recibe notificaciones IPN cuando un pago cambia de estado.
// Configurado en MP: notification_url = https://[host]/api/payments/mp-webhook
//
// MP envía POST con JSON tipo: { "type": "payment", "data": { "id": "12345" } }
// Confirmamos el estado del pago vía API y actualizamos customer_orders.

import { NextResponse, type NextRequest } from "next/server";
import { Payment } from "mercadopago";
import { getMpClient } from "@/lib/payments";
import { get, run, transaction } from "@/lib/db";
import { recordCommissionForOrder } from "@/lib/referrals";

interface MpNotification {
  type?: string;
  topic?: string;
  data?: { id?: string | number };
  resource?: string;
}

export async function POST(req: NextRequest) {
  let body: MpNotification;
  try {
    body = await req.json();
  } catch {
    // MP a veces manda querystring, no body
    body = {};
  }

  const url = new URL(req.url);
  const topic = body.type || body.topic || url.searchParams.get("type") || url.searchParams.get("topic");
  const dataId =
    String(body.data?.id || url.searchParams.get("data.id") || url.searchParams.get("id") || "");

  if (topic !== "payment" || !dataId) {
    // Ignoramos eventos que no son de pago (merchant_order, etc.)
    return NextResponse.json({ ok: true, ignored: true });
  }

  const client = getMpClient();
  if (!client) {
    return NextResponse.json({ error: "mp_disabled" }, { status: 503 });
  }

  try {
    const payment = new Payment(client);
    const paymentInfo = await payment.get({ id: dataId });

    const externalRef = paymentInfo.external_reference;
    const status = paymentInfo.status; // approved | pending | rejected | cancelled | refunded
    const orderId = Number(externalRef);
    if (!orderId || !status) {
      return NextResponse.json({ ok: true, no_order: true });
    }

    const order = await get<{
      id: number;
      status: string;
      payment_method: string | null;
    }>(`SELECT id, status, payment_method FROM customer_orders WHERE id = ?`, orderId);
    if (!order) {
      return NextResponse.json({ ok: true, order_not_found: true });
    }

    // Idempotencia: si ya está en paid o más adelante, ignoramos.
    if (["paid", "preparing", "ready_for_pickup", "shipped", "delivered"].includes(order.status)) {
      // Solo actualizamos los IDs de MP por trazabilidad si no estaban
      await run(
        `UPDATE customer_orders
           SET mp_payment_id = COALESCE(mp_payment_id, ?),
               mp_status = ?,
               updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        String(dataId), status, orderId
      );
      return NextResponse.json({ ok: true, already_processed: true });
    }

    if (status === "approved") {
      // Pago aprobado: marcamos orden como paid + disparamos hook de comisión.
      await transaction(async (tx) => {
        await tx.run(
          `UPDATE customer_orders
             SET status = 'paid',
                 payment_confirmed_at = CURRENT_TIMESTAMP,
                 mp_payment_id = ?,
                 mp_status = ?,
                 updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          String(dataId), status, orderId
        );
        await tx.run(
          `INSERT INTO customer_order_events (order_id, event_type, message)
           VALUES (?, 'payment_confirmed', ?)`,
          orderId, `Pago confirmado vía MercadoPago · ID ${dataId}`
        );
      });

      // Hook de comisión embajadores
      try {
        await recordCommissionForOrder(orderId);
      } catch (e) {
        console.error("recordCommissionForOrder failed in mp-webhook:", e);
      }

      return NextResponse.json({ ok: true, status: "paid" });
    }

    if (status === "rejected" || status === "cancelled") {
      await run(
        `UPDATE customer_orders
           SET mp_payment_id = ?, mp_status = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        String(dataId), status, orderId
      );
      await run(
        `INSERT INTO customer_order_events (order_id, event_type, message)
         VALUES (?, 'payment_rejected', ?)`,
        orderId, `Pago rechazado vía MercadoPago (${status}) · ID ${dataId}`
      );
      return NextResponse.json({ ok: true, status });
    }

    // pending u otros: solo guardamos el estado, no transicionamos la orden
    await run(
      `UPDATE customer_orders
         SET mp_payment_id = ?, mp_status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      String(dataId), status, orderId
    );
    return NextResponse.json({ ok: true, status });
  } catch (e: any) {
    console.error("MP webhook error:", e);
    return NextResponse.json({ error: "internal", message: e?.message }, { status: 500 });
  }
}
