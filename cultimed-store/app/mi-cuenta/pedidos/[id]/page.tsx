import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireCustomer } from "@/lib/auth";
import { get, all } from "@/lib/db";
import { formatCLP, formatDateTime } from "@/lib/format";
import OrderTimeline from "@/components/OrderTimeline";
import { ORDER_STATUS_LABEL, isOrderAwaitingPayment, isOrderPaid } from "@/lib/order-status";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({ params }: { params: { id: string } }) {
  const customer = await requireCustomer();
  const orderId = parseInt(params.id, 10);
  if (!orderId) notFound();

  const order = await get<{
    id: number;
    folio: string;
    status: string;
    subtotal: number;
    total: number;
    shipping_method: string;
    shipping_address: string | null;
    shipping_city: string | null;
    shipping_region: string | null;
    shipping_phone: string | null;
    created_at: string;
    customer_account_id: number;
  }>(`SELECT * FROM customer_orders WHERE id = ?`, orderId);

  if (!order) notFound();
  if (order.customer_account_id !== customer.id) redirect("/mi-cuenta/pedidos");

  const items = await all<{
    product_name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
  }>(
    `SELECT pr.name as product_name, i.quantity, i.unit_price, i.total_price
     FROM customer_order_items i JOIN products pr ON pr.id = i.product_id
     WHERE i.order_id = ?`,
    orderId
  );

  const events = await all<{ event_type: string; message: string | null; created_at: string }>(
    `SELECT event_type, message, created_at FROM customer_order_events
     WHERE order_id = ? ORDER BY created_at ASC`,
    orderId
  );

  const statusLabel = ORDER_STATUS_LABEL[order.status] || order.status;
  const needsPayment = isOrderAwaitingPayment(order.status) || order.status === "proof_uploaded";

  return (
    <section className="max-w-[1440px] mx-auto px-6 lg:px-12 py-12 lg:py-20">
      <div className="mb-8">
        <Link href="/mi-cuenta/pedidos" className="btn-link">← Mis pedidos</Link>
      </div>

      <div className="grid grid-cols-12 gap-x-6 gap-y-10">
        <div className="col-span-12 lg:col-span-7">
          <p className="eyebrow mb-3">— Pedido · {order.folio}</p>
          <h1 className="font-display text-display-3 mb-2">{statusLabel}</h1>
          <p className="text-sm text-ink-muted font-mono">{formatDateTime(order.created_at)}</p>

          <div className="mt-8 border border-rule bg-paper-bright divide-y divide-rule-soft">
            {items.map((it, i) => (
              <div key={i} className="px-5 py-4 flex justify-between gap-4">
                <div>
                  <p className="font-display">{it.product_name}</p>
                  <p className="text-xs font-mono text-ink-muted">×{it.quantity}</p>
                </div>
                <p className="font-mono tabular-nums">{formatCLP(it.total_price)}</p>
              </div>
            ))}
            <div className="px-5 py-4 flex justify-between font-display text-xl">
              <span>Total</span>
              <span className="tabular-nums">{formatCLP(order.total)}</span>
            </div>
          </div>

          <div className="mt-6 text-sm text-ink-muted space-y-1">
            <p><strong>Despacho:</strong> {order.shipping_method === "pickup" ? "Retiro" : "Courier"}</p>
            {order.shipping_address && (
              <p>{order.shipping_address}, {order.shipping_city} ({order.shipping_region})</p>
            )}
            {order.shipping_phone && <p className="font-mono">{order.shipping_phone}</p>}
          </div>
        </div>

        <div className="col-span-12 lg:col-span-5 space-y-6">
          <OrderTimeline events={events} status={order.status} shippingMethod={order.shipping_method} />
          {needsPayment && !isOrderPaid(order.status) && (
            <Link href={`/checkout/${order.id}`} className="btn-brass w-full text-center">
              {order.status === "proof_uploaded" ? "Ver estado de pago →" : "Completar pago / subir comprobante →"}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}