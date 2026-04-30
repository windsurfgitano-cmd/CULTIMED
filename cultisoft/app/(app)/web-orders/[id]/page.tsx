import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { all, get, run, transaction } from "@/lib/db";
import { formatCLP, formatDateTime } from "@/lib/format";
import { logAudit } from "@/lib/audit";
import { recordCommissionForOrder } from "@/lib/referrals";
import { resolveStorageUrl } from "@/lib/storage";
import PageHeader from "@/components/PageHeader";

export const dynamic = "force-dynamic";

interface OrderFull {
  id: number;
  folio: string;
  customer_account_id: number;
  status: string;
  subtotal: number;
  total: number;
  shipping_address: string | null;
  shipping_city: string | null;
  shipping_region: string | null;
  shipping_phone: string | null;
  shipping_method: string;
  shipping_tracking: string | null;
  notes: string | null;
  payment_method: string;
  payment_proof_url: string | null;
  payment_proof_uploaded_at: string | null;
  payment_confirmed_by: number | null;
  payment_confirmed_at: string | null;
  payment_rejection_reason: string | null;
  whatsapp_sent_at: string | null;
  created_at: string;
  customer_name: string;
  customer_email: string;
  customer_rut: string | null;
  customer_phone: string | null;
  customer_account_status: string;
  confirmed_by_name: string | null;
}

interface OrderItem {
  id: number;
  quantity: number;
  unit_price: number;
  total_price: number;
  product_id: number;
  product_name: string;
  product_sku: string;
  presentation: string | null;
}

interface OrderEvent {
  id: number;
  event_type: string;
  message: string;
  staff_name: string | null;
  created_at: string;
}

const STORE_PUBLIC_BASE = process.env.STORE_PUBLIC_BASE || "http://localhost:3000";

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending_proof:    { label: "Esperando comprobante", cls: "pill-neutral" },
  proof_uploaded:   { label: "Comprobante recibido", cls: "pill-warning" },
  paid:             { label: "Pago confirmado",       cls: "pill-success" },
  preparing:        { label: "En preparación",        cls: "pill-tertiary" },
  ready_for_pickup: { label: "Lista para retiro",     cls: "pill-success" },
  shipped:          { label: "Despachada",            cls: "pill-success" },
  delivered:        { label: "Entregada",             cls: "pill-success" },
  cancelled:        { label: "Cancelada",             cls: "pill-error" },
  rejected:         { label: "Comprobante rechazado", cls: "pill-error" },
};

const EVENT_LABEL: Record<string, string> = {
  created:          "Orden creada",
  proof_uploaded:   "Comprobante recibido",
  payment_confirmed:"Pago confirmado",
  payment_rejected: "Comprobante rechazado",
  preparing:        "En preparación",
  ready_for_pickup: "Lista para retiro",
  shipped:          "Despachada",
  delivered:        "Entregada",
  cancelled:        "Cancelada",
};

async function transitionAction(formData: FormData) {
  "use server";
  const staff = await requireStaff();
  const id = Number(formData.get("id"));
  const action = String(formData.get("action") || "");
  const message = String(formData.get("message") || "").trim();
  const tracking = String(formData.get("tracking") || "").trim();
  if (!id) return;

  const order = await get<{ status: string; folio: string }>(
    `SELECT status, folio FROM customer_orders WHERE id = ?`,
    id
  );
  if (!order) return;

  const transitions: Record<string, { from: string[]; to: string; event: string; defaultMsg: string }> = {
    confirm_payment: {
      from: ["proof_uploaded"],
      to: "paid",
      event: "payment_confirmed",
      defaultMsg: "Pago confirmado por equipo Cultimed.",
    },
    reject_payment: {
      from: ["proof_uploaded"],
      to: "rejected",
      event: "payment_rejected",
      defaultMsg: "Comprobante no coincide con el monto/referencia esperada. Sube uno nuevo.",
    },
    start_preparing: {
      from: ["paid"],
      to: "preparing",
      event: "preparing",
      defaultMsg: "Pedido en preparación.",
    },
    mark_ready: {
      from: ["preparing", "paid"],
      to: "ready_for_pickup",
      event: "ready_for_pickup",
      defaultMsg: "Listo para retiro en farmacia.",
    },
    mark_shipped: {
      from: ["preparing", "paid"],
      to: "shipped",
      event: "shipped",
      defaultMsg: "Despachado al paciente.",
    },
    mark_delivered: {
      from: ["ready_for_pickup", "shipped"],
      to: "delivered",
      event: "delivered",
      defaultMsg: "Entregado al paciente.",
    },
    cancel: {
      from: ["pending_proof", "proof_uploaded", "paid", "preparing", "ready_for_pickup"],
      to: "cancelled",
      event: "cancelled",
      defaultMsg: "Pedido cancelado.",
    },
  };

  const rule = transitions[action];
  if (!rule) return;
  if (!rule.from.includes(order.status)) return;

  await transaction(async (tx) => {
    if (action === "confirm_payment") {
      await tx.run(
        `UPDATE customer_orders
         SET status = ?, payment_confirmed_by = ?, payment_confirmed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        rule.to, staff.id, id
      );
    } else if (action === "reject_payment") {
      await tx.run(
        `UPDATE customer_orders
         SET status = ?, payment_rejection_reason = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        rule.to, message || rule.defaultMsg, id
      );
    } else if (action === "mark_shipped" && tracking) {
      await tx.run(
        `UPDATE customer_orders
         SET status = ?, shipping_tracking = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        rule.to, tracking, id
      );
    } else {
      await tx.run(
        `UPDATE customer_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        rule.to, id
      );
    }

    await tx.run(
      `INSERT INTO customer_order_events (order_id, event_type, message, staff_id)
       VALUES (?, ?, ?, ?)`,
      id, rule.event, message || rule.defaultMsg, staff.id
    );
  });

  // Programa Embajadores: al confirmar pago, calcular comisión correspondiente (10% primera o 1% histórica).
  // Idempotente: UNIQUE(order_id, type) evita doble cálculo.
  if (action === "confirm_payment") {
    try {
      const res = await recordCommissionForOrder(id);
      if (res.type) {
        await logAudit({
          staffId: staff.id,
          action: `referral_commission_${res.type}`,
          entityType: "customer_order",
          entityId: id,
          details: { amount: res.amount, type: res.type, folio: order.folio },
        });
      }
    } catch (e) {
      // No bloqueamos el flujo de pago si falla el cálculo de comisión — se reporta en logs.
      console.error("recordCommissionForOrder failed:", e);
    }
  }

  await logAudit({
    staffId: staff.id,
    action: `web_order_${action}`,
    entityType: "customer_order",
    entityId: id,
    details: { folio: order.folio, message: message || null, tracking: tracking || null },
  });

  redirect(`/web-orders/${id}`);
}

export default async function WebOrderDetail({ params }: { params: { id: string } }) {
  await requireStaff();
  const id = parseInt(params.id, 10);
  if (!id) notFound();

  const o = await get<OrderFull>(
    `SELECT o.*, c.full_name as customer_name, c.email as customer_email,
       c.rut as customer_rut, c.phone as customer_phone,
       c.prescription_status as customer_account_status,
       s.full_name as confirmed_by_name
     FROM customer_orders o
     JOIN customer_accounts c ON c.id = o.customer_account_id
     LEFT JOIN staff s ON s.id = o.payment_confirmed_by
     WHERE o.id = ?`,
    id
  );
  if (!o) notFound();

  const items = await all<OrderItem>(
    `SELECT i.id, i.quantity, i.unit_price, i.total_price, i.product_id,
       p.name as product_name, p.sku as product_sku, p.presentation
     FROM customer_order_items i
     JOIN products p ON p.id = i.product_id
     WHERE i.order_id = ?
     ORDER BY i.id`,
    id
  );

  const events = await all<OrderEvent>(
    `SELECT e.id, e.event_type, e.message, e.created_at, s.full_name as staff_name
     FROM customer_order_events e
     LEFT JOIN staff s ON s.id = e.staff_id
     WHERE e.order_id = ?
     ORDER BY e.created_at DESC`,
    id
  );

  const meta = STATUS_META[o.status] ?? { label: o.status, cls: "pill-neutral" };
  const isImage = o.payment_proof_url && /\.(png|jpe?g|webp|gif)$/i.test(o.payment_proof_url);
  const isPdf = o.payment_proof_url && /\.pdf$/i.test(o.payment_proof_url);
  // resolveStorageUrl: maneja "bucket://path" (Supabase Storage signed URL) o legacy "/uploads/..."
  const proofFullUrl = await resolveStorageUrl(o.payment_proof_url);
  const waMessage = encodeURIComponent(
    `Hola ${o.customer_name}, te escribimos desde Cultimed sobre tu pedido ${o.folio} ($${o.total.toLocaleString("es-CL")}).`
  );
  const waLink = o.shipping_phone
    ? `https://wa.me/${o.shipping_phone.replace(/[^0-9]/g, "")}?text=${waMessage}`
    : null;

  return (
    <>
      <PageHeader
        numeral="03B"
        eyebrow={`Pedido web · ${meta.label}`}
        title={o.folio}
        subtitle={`Creado el ${formatDateTime(o.created_at)} · ${o.customer_name}`}
        actions={
          <Link href="/web-orders" className="font-mono text-[11px] uppercase tracking-widest text-ink hover:text-brass">
            ← Volver
          </Link>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: items + comprobante + transitions */}
        <div className="lg:col-span-2 space-y-10">
          {/* Items */}
          <section>
            <div className="flex items-baseline gap-3 mb-4">
              <span className="editorial-numeral text-sm text-ink-subtle">— I</span>
              <span className="eyebrow">Items del pedido</span>
            </div>
            <div className="border border-rule bg-paper-bright overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-rule bg-paper-dim/40">
                    <th className="text-left px-5 py-3 eyebrow text-ink-subtle">Producto</th>
                    <th className="text-right px-5 py-3 eyebrow text-ink-subtle">Cant.</th>
                    <th className="text-right px-5 py-3 eyebrow text-ink-subtle">Unit.</th>
                    <th className="text-right px-5 py-3 eyebrow text-ink-subtle">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} className="border-b border-rule-soft last:border-0">
                      <td className="px-5 py-4">
                        <div className="text-ink">{it.product_name}</div>
                        <div className="text-[11px] text-ink-subtle font-mono mt-0.5">{it.product_sku}</div>
                      </td>
                      <td className="px-5 py-4 text-right tabular-nums font-mono">{it.quantity}</td>
                      <td className="px-5 py-4 text-right tabular-nums font-mono text-ink-muted">{formatCLP(it.unit_price)}</td>
                      <td className="px-5 py-4 text-right tabular-nums font-mono text-ink">{formatCLP(it.total_price)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-rule">
                    <td colSpan={3} className="px-5 py-3 text-right eyebrow text-ink-subtle">Subtotal</td>
                    <td className="px-5 py-3 text-right tabular-nums font-mono text-ink">{formatCLP(o.subtotal)}</td>
                  </tr>
                  <tr className="border-t border-rule bg-paper-dim/30">
                    <td colSpan={3} className="px-5 py-3 text-right font-display italic text-base">Total</td>
                    <td className="px-5 py-3 text-right tabular-nums font-mono text-base text-ink">{formatCLP(o.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          {/* Comprobante */}
          <section>
            <div className="flex items-baseline gap-3 mb-4">
              <span className="editorial-numeral text-sm text-ink-subtle">— II</span>
              <span className="eyebrow">Comprobante de transferencia</span>
            </div>
            {!o.payment_proof_url ? (
              <div className="border border-rule bg-paper-bright p-12 text-center">
                <p className="font-display italic text-2xl text-ink-muted">Aún no subido.</p>
                <p className="text-sm text-ink-subtle mt-2">El paciente debe subir comprobante de transferencia.</p>
              </div>
            ) : isImage ? (
              <div className="border border-rule bg-paper-bright p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={proofFullUrl!}
                  alt={`Comprobante ${o.folio}`}
                  className="block w-full h-auto max-h-[70vh] object-contain bg-paper-dim"
                />
                <div className="mt-3 px-2 pb-1 flex items-center justify-between text-[11px] font-mono text-ink-subtle">
                  <span className="break-all">{o.payment_proof_url}</span>
                  <a href={proofFullUrl!} target="_blank" rel="noreferrer" className="ml-3 shrink-0 underline-offset-4 hover:underline text-ink">
                    abrir ↗
                  </a>
                </div>
              </div>
            ) : isPdf ? (
              <div className="border border-rule bg-paper-bright">
                <object data={proofFullUrl!} type="application/pdf" className="w-full h-[70vh]">
                  <div className="p-12 text-center">
                    <a href={proofFullUrl!} target="_blank" rel="noreferrer" className="btn-primary">
                      Abrir PDF
                    </a>
                  </div>
                </object>
              </div>
            ) : (
              <div className="border border-rule bg-paper-bright p-12 text-center">
                <a href={proofFullUrl!} target="_blank" rel="noreferrer" className="btn-primary">
                  Descargar archivo
                </a>
              </div>
            )}

            {o.payment_rejection_reason && (
              <div className="mt-4 p-4 border-l-2 border-sangria bg-sangria/5">
                <p className="eyebrow text-sangria mb-1">— Comprobante rechazado</p>
                <p className="text-sm text-ink whitespace-pre-wrap">{o.payment_rejection_reason}</p>
              </div>
            )}
          </section>

          {/* Transitions */}
          <section>
            <div className="flex items-baseline gap-3 mb-4">
              <span className="editorial-numeral text-sm text-ink-subtle">— III</span>
              <span className="eyebrow">Acciones</span>
            </div>
            <div className="border border-rule bg-paper-bright p-5 space-y-5">
              {o.status === "proof_uploaded" && (
                <form action={transitionAction} className="space-y-4">
                  <input type="hidden" name="id" value={o.id} />
                  <div>
                    <label htmlFor="message" className="input-label">
                      Nota (opcional · queda registrada en bitácora)
                    </label>
                    <textarea
                      id="message"
                      name="message"
                      rows={2}
                      className="input-field resize-none"
                      placeholder="Ej: Confirmado vs cartola BancoEstado · ref. 180553053"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="submit"
                      name="action"
                      value="reject_payment"
                      className="px-4 py-3 border border-sangria text-sangria font-mono text-[11px] uppercase tracking-widest hover:bg-sangria hover:text-paper transition-colors"
                    >
                      Rechazar comprobante
                    </button>
                    <button
                      type="submit"
                      name="action"
                      value="confirm_payment"
                      className="btn-primary"
                    >
                      Confirmar pago
                    </button>
                  </div>
                </form>
              )}

              {o.status === "paid" && (
                <form action={transitionAction} className="flex gap-3 flex-wrap">
                  <input type="hidden" name="id" value={o.id} />
                  <button type="submit" name="action" value="start_preparing" className="btn-primary">
                    Empezar preparación →
                  </button>
                  {o.shipping_method === "pickup" ? (
                    <button type="submit" name="action" value="mark_ready" className="px-4 py-3 border border-ink text-ink font-mono text-[11px] uppercase tracking-widest hover:bg-ink hover:text-paper transition-colors">
                      Listo para retiro
                    </button>
                  ) : (
                    <button type="submit" name="action" value="mark_shipped" className="px-4 py-3 border border-ink text-ink font-mono text-[11px] uppercase tracking-widest hover:bg-ink hover:text-paper transition-colors">
                      Despachar →
                    </button>
                  )}
                </form>
              )}

              {o.status === "preparing" && (
                <form action={transitionAction} className="flex gap-3 flex-wrap items-end">
                  <input type="hidden" name="id" value={o.id} />
                  {o.shipping_method === "pickup" ? (
                    <button type="submit" name="action" value="mark_ready" className="btn-primary">
                      Listo para retiro
                    </button>
                  ) : (
                    <>
                      <div className="flex-1 min-w-[220px]">
                        <label htmlFor="tracking" className="input-label">N° de seguimiento (opcional)</label>
                        <input
                          id="tracking"
                          type="text"
                          name="tracking"
                          className="input-field"
                          placeholder="Tracking del courier"
                        />
                      </div>
                      <button type="submit" name="action" value="mark_shipped" className="btn-primary">
                        Despachar
                      </button>
                    </>
                  )}
                </form>
              )}

              {(o.status === "ready_for_pickup" || o.status === "shipped") && (
                <form action={transitionAction}>
                  <input type="hidden" name="id" value={o.id} />
                  <button type="submit" name="action" value="mark_delivered" className="btn-primary">
                    Marcar como entregada
                  </button>
                </form>
              )}

              {!["delivered", "cancelled", "rejected"].includes(o.status) && (
                <form action={transitionAction} className="pt-3 border-t border-rule-soft">
                  <input type="hidden" name="id" value={o.id} />
                  <button
                    type="submit"
                    name="action"
                    value="cancel"
                    className="font-mono text-[11px] uppercase tracking-widest text-ink-subtle hover:text-sangria underline-offset-4 hover:underline"
                  >
                    Cancelar pedido →
                  </button>
                </form>
              )}

              {["delivered", "cancelled", "rejected"].includes(o.status) && (
                <p className="text-sm text-ink-muted italic">
                  Pedido en estado terminal. Sin acciones disponibles.
                </p>
              )}
            </div>

            {waLink && (
              <a
                href={waLink}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-ink hover:text-brass"
              >
                Contactar por WhatsApp →
              </a>
            )}
          </section>
        </div>

        {/* Right: paciente + entrega + timeline */}
        <aside className="space-y-8">
          <section>
            <div className="flex items-baseline gap-3 mb-4">
              <span className="editorial-numeral text-sm text-ink-subtle">— IV</span>
              <span className="eyebrow">Paciente</span>
            </div>
            <div className="border border-rule bg-paper-bright p-5 space-y-3 text-sm">
              <KV k="Nombre" v={o.customer_name} />
              <KV k="Email" v={o.customer_email} mono />
              <KV k="RUT" v={o.customer_rut || "—"} mono />
              <KV k="Teléfono" v={o.customer_phone || "—"} mono />
              <KV
                k="Receta"
                v={o.customer_account_status === "aprobada" ? "Aprobada" : o.customer_account_status}
              />
              <Link
                href={`/web-prescriptions/${o.customer_account_id}`}
                className="inline-block mt-1 font-mono text-[11px] uppercase tracking-widest text-ink hover:text-brass"
              >
                Ver receta médica →
              </Link>
            </div>
          </section>

          <section>
            <div className="flex items-baseline gap-3 mb-4">
              <span className="editorial-numeral text-sm text-ink-subtle">— V</span>
              <span className="eyebrow">Entrega</span>
            </div>
            <div className="border border-rule bg-paper-bright p-5 space-y-3 text-sm">
              <KV
                k="Método"
                v={o.shipping_method === "pickup" ? "Retiro en farmacia" : "Despacho a domicilio"}
              />
              <KV k="Teléfono · WhatsApp" v={o.shipping_phone || "—"} mono />
              {o.shipping_address && (
                <KV
                  k="Dirección"
                  v={[o.shipping_address, o.shipping_city, o.shipping_region].filter(Boolean).join(", ")}
                />
              )}
              {o.shipping_tracking && <KV k="Tracking" v={o.shipping_tracking} mono />}
              {o.notes && (
                <div className="pt-2 mt-2 border-t border-rule-soft">
                  <p className="eyebrow text-ink-subtle mb-1">— Notas del paciente</p>
                  <p className="text-sm text-ink whitespace-pre-wrap">{o.notes}</p>
                </div>
              )}
            </div>
          </section>

          <section>
            <div className="flex items-baseline gap-3 mb-4">
              <span className="editorial-numeral text-sm text-ink-subtle">— VI</span>
              <span className="eyebrow">Bitácora</span>
            </div>
            <ol className="border border-rule bg-paper-bright p-5 space-y-4 text-sm">
              {events.map((e, idx) => (
                <li key={e.id} className="flex gap-3">
                  <span className="editorial-numeral text-[11px] text-brass shrink-0 w-6">
                    {String(events.length - idx).padStart(2, "0")}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-ink font-medium">
                      {EVENT_LABEL[e.event_type] || e.event_type}
                    </p>
                    {e.message && (
                      <p className="text-[12px] text-ink-muted mt-0.5">{e.message}</p>
                    )}
                    <p className="text-[10px] text-ink-subtle font-mono mt-1">
                      {formatDateTime(e.created_at)}
                      {e.staff_name ? ` · ${e.staff_name}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </>
  );
}

function KV({ k, v, mono = false }: { k: string; v: string; mono?: boolean }) {
  return (
    <div>
      <dt className="eyebrow text-ink-subtle">{k}</dt>
      <dd className={`mt-0.5 text-sm text-ink ${mono ? "font-mono break-all" : ""}`}>{v}</dd>
    </div>
  );
}
