import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireCustomer } from "@/lib/auth";
import { get, all, run } from "@/lib/db";
import { formatCLP, formatDateTime } from "@/lib/format";
import { saveUploadedFile } from "@/lib/uploads";
import OrderTimeline from "@/components/OrderTimeline";
import WhatsAppButton from "@/components/WhatsAppButton";

export const dynamic = "force-dynamic";

interface OrderRow {
  id: number; folio: string; status: string; subtotal: number; total: number;
  shipping_method: string; shipping_address: string | null; shipping_city: string | null;
  shipping_phone: string;
  payment_proof_url: string | null; payment_proof_uploaded_at: string | null;
  payment_confirmed_at: string | null; payment_rejection_reason: string | null;
  whatsapp_sent_at: string | null;
  created_at: string;
}
interface ItemRow {
  product_name: string; quantity: number; unit_price: number; total_price: number;
}
interface EventRow {
  event_type: string; message: string | null; created_at: string;
}

async function uploadProofAction(formData: FormData) {
  "use server";
  const customer = requireCustomer();
  const orderId = Number(formData.get("order_id"));
  const file = formData.get("proof") as File | null;
  if (!file || file.size === 0) redirect(`/checkout/${orderId}?e=missing`);
  if (file.size > 8 * 1024 * 1024) redirect(`/checkout/${orderId}?e=too_big`);

  const order = get<{ id: number; customer_account_id: number; status: string }>(
    `SELECT id, customer_account_id, status FROM customer_orders WHERE id = ?`,
    orderId
  );
  if (!order || order.customer_account_id !== customer.id) redirect("/mi-cuenta");
  if (order.status !== "pending_payment" && order.status !== "proof_uploaded") {
    redirect(`/checkout/${orderId}`);
  }

  const url = await saveUploadedFile(file, `proofs/${customer.id}/${orderId}`);
  run(
    `UPDATE customer_orders
     SET payment_proof_url = ?, payment_proof_uploaded_at = CURRENT_TIMESTAMP,
         status = 'proof_uploaded', updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    url, orderId
  );
  run(
    `INSERT INTO customer_order_events (order_id, event_type, message)
     VALUES (?, 'proof_uploaded', 'Comprobante de transferencia recibido')`,
    orderId
  );
  redirect(`/checkout/${orderId}?ok=1`);
}

export default function OrderPaymentPage({ params, searchParams }: { params: { id: string }; searchParams: { e?: string; ok?: string } }) {
  const customer = requireCustomer();
  const orderId = parseInt(params.id, 10);
  if (!orderId) notFound();

  const order = get<OrderRow & { customer_account_id: number }>(
    `SELECT * FROM customer_orders WHERE id = ?`,
    orderId
  );
  if (!order) notFound();
  if (order.customer_account_id !== customer.id) redirect("/mi-cuenta");

  const items = all<ItemRow>(
    `SELECT pr.name as product_name, i.quantity, i.unit_price, i.total_price
     FROM customer_order_items i JOIN products pr ON pr.id = i.product_id
     WHERE i.order_id = ?`,
    orderId
  );
  const events = all<EventRow>(
    `SELECT event_type, message, created_at FROM customer_order_events
     WHERE order_id = ? ORDER BY created_at ASC`,
    orderId
  );

  const bank = {
    name: process.env.NEXT_PUBLIC_BANK_NAME || "BancoEstado",
    type: process.env.NEXT_PUBLIC_BANK_ACCOUNT_TYPE || "Cuenta Corriente",
    number: process.env.NEXT_PUBLIC_BANK_ACCOUNT_NUMBER || "00012345678",
    rut: process.env.NEXT_PUBLIC_BANK_RUT || "76.123.456-7",
    holder: process.env.NEXT_PUBLIC_BANK_HOLDER || "Cultimed SpA",
    email: process.env.NEXT_PUBLIC_BANK_EMAIL || "pagos@dispensariocultimed.cl",
  };

  const isPending = order.status === "pending_payment";
  const isProofUploaded = order.status === "proof_uploaded";
  const isConfirmed = ["payment_confirmed", "preparing", "shipped", "delivered"].includes(order.status);
  const isRejected = !!order.payment_rejection_reason;

  return (
    <>
      {/* Header */}
      <section className="max-w-[1440px] mx-auto px-6 lg:px-12 pt-12 lg:pt-16 pb-8">
        <ol className="flex items-baseline gap-6 lg:gap-12 mb-12">
          <Step n="01" label="Información" done />
          <span className="hairline flex-1" />
          <Step n="02" label="Transferencia" active={isPending || isProofUploaded} done={isConfirmed} />
          <span className={"flex-1 h-px " + (isConfirmed ? "bg-ink" : "bg-rule")} />
          <Step n="03" label="Confirmación" active={isConfirmed} />
        </ol>

        <div className="grid grid-cols-12 gap-x-6 items-end gap-y-6">
          <div className="col-span-12 lg:col-span-8">
            <p className="eyebrow mb-4 flex items-baseline gap-3">
              <span className="font-mono nums-lining text-ink">— Folio · {order.folio}</span>
              <span className="text-ink-subtle">{formatDateTime(order.created_at)}</span>
            </p>
            <h1 className="font-display text-display-2 leading-[0.98] text-balance">
              {isPending && <><span className="font-light">Tu orden está</span> <span className="italic">pendiente</span> <span className="font-light">de pago.</span></>}
              {isProofUploaded && <><span className="font-light">Estamos</span> <span className="italic">verificando</span> <span className="font-light">tu comprobante.</span></>}
              {isConfirmed && <><span className="font-light">Tu pago fue</span> <span className="italic text-forest">confirmado</span><span className="font-light">.</span></>}
            </h1>
          </div>
          <div className="col-span-12 lg:col-span-3 lg:col-start-10 lg:pb-4">
            <p className="eyebrow text-ink-muted mb-1">Total a transferir</p>
            <p className="font-display text-4xl nums-lining tabular-nums">{formatCLP(order.total)}</p>
          </div>
        </div>
      </section>

      <div className="hairline-thick max-w-[1440px] mx-auto" />

      {/* Main */}
      <section className="max-w-[1440px] mx-auto px-6 lg:px-12 py-16 lg:py-24 grid grid-cols-12 gap-x-6 gap-y-16">
        {/* LEFT — bank + upload */}
        <div className="col-span-12 lg:col-span-7 space-y-12">
          {/* Bank info */}
          <div>
            <p className="eyebrow mb-4 flex items-baseline gap-3">
              <span className="editorial-numeral text-base text-ink-subtle">— I</span>
              <span>Datos para transferencia bancaria</span>
            </p>
            <div className="bg-paper-bright border border-rule p-7 lg:p-9">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 mb-6">
                <DataLine label="Banco" value={bank.name} />
                <DataLine label="Tipo" value={bank.type} />
                <DataLine label="Número de cuenta" value={bank.number} mono />
                <DataLine label="RUT" value={bank.rut} mono />
                <DataLine label="Titular" value={bank.holder} />
                <DataLine label="Email" value={bank.email} />
              </dl>
              <div className="hairline mb-6" />
              <div className="flex items-baseline justify-between">
                <p>
                  <span className="eyebrow text-sangria mb-1 block">— Referencia obligatoria</span>
                  <span className="font-mono text-base text-ink nums-lining">
                    {customer.rut ? customer.rut.replace(/[.\-]/g, "") : `Folio ${order.folio}`}
                  </span>
                </p>
                <p className="text-right">
                  <span className="eyebrow mb-1 block">— Monto exacto</span>
                  <span className="font-mono text-2xl text-ink nums-lining tabular-nums">{formatCLP(order.total)}</span>
                </p>
              </div>
            </div>
            <p className="text-[11px] font-mono text-ink-muted mt-4 leading-relaxed">
              Tienes hasta <span className="text-ink">24h hábiles</span> para realizar la transferencia.
              Usa <span className="text-ink">tu RUT sin puntos ni guión</span> como referencia para que podamos identificar
              tu pago automáticamente.
            </p>
          </div>

          {/* Upload */}
          {(isPending || isProofUploaded) && !isConfirmed && (
            <div>
              <p className="eyebrow mb-4 flex items-baseline gap-3">
                <span className="editorial-numeral text-base text-ink-subtle">— II</span>
                <span>Sube tu comprobante</span>
              </p>

              {searchParams.ok && (
                <div className="mb-6 p-5 bg-forest/5 border-l-2 border-forest">
                  <p className="eyebrow text-forest mb-1">— Recibido</p>
                  <p className="text-sm">
                    Tu comprobante está siendo revisado por nuestro equipo. Te avisaremos por
                    WhatsApp cuando lo confirmemos.
                  </p>
                </div>
              )}

              {searchParams.e && (
                <div className="mb-6 p-5 bg-sangria/10 border-l-2 border-sangria">
                  <p className="text-sm">
                    {searchParams.e === "missing" ? "Selecciona un archivo." :
                     searchParams.e === "too_big" ? "Archivo supera 8 MB." :
                     "Error al subir."}
                  </p>
                </div>
              )}

              {order.payment_proof_url ? (
                <div className="bg-paper-bright border border-rule p-6">
                  <p className="eyebrow text-forest mb-2">— Comprobante recibido</p>
                  <p className="text-sm text-ink-muted mb-4">
                    Subido el {formatDateTime(order.payment_proof_uploaded_at)}.
                    Lo estamos verificando. Si necesitas reemplazarlo, sube uno nuevo.
                  </p>
                  <a
                    href={order.payment_proof_url}
                    target="_blank"
                    rel="noopener"
                    className="text-xs uppercase tracking-widest font-mono text-brass-dim border-b border-brass-dim/40 hover:border-brass-dim pb-0.5"
                  >
                    Ver comprobante →
                  </a>
                </div>
              ) : null}

              <form action={uploadProofAction} encType="multipart/form-data" className="mt-6">
                <input type="hidden" name="order_id" value={order.id} />
                <label
                  htmlFor="proof"
                  className="block border-2 border-dashed border-rule hover:border-ink p-10 lg:p-12 text-center bg-paper-bright transition-all cursor-pointer"
                >
                  <input id="proof" name="proof" type="file" accept=".pdf,image/jpeg,image/png" required className="sr-only" />
                  <p className="font-display text-2xl italic mb-2">Selecciona archivo</p>
                  <p className="text-xs font-mono uppercase tracking-widest text-ink-muted">
                    Comprobante en PDF, JPG o PNG · máx 8 MB
                  </p>
                </label>
                <button type="submit" className="btn-brass w-full mt-4">
                  Enviar comprobante
                </button>
              </form>
            </div>
          )}

          {isRejected && (
            <div className="p-7 bg-sangria/5 border-l-2 border-sangria">
              <p className="eyebrow text-sangria mb-2">— Comprobante rechazado</p>
              <p className="font-display text-xl mb-3">{order.payment_rejection_reason}</p>
              <p className="text-sm text-ink-muted">
                Sube un nuevo comprobante o contáctanos por WhatsApp para resolver.
              </p>
            </div>
          )}
        </div>

        {/* RIGHT — order summary + timeline */}
        <aside className="col-span-12 lg:col-span-4 lg:col-start-9 space-y-8">
          {/* Order summary */}
          <div className="border border-rule bg-paper-bright p-6 lg:p-7">
            <p className="eyebrow mb-4">— Tu orden</p>
            <ul className="divide-y divide-rule-soft mb-5">
              {items.map((it, i) => (
                <li key={i} className="py-2.5 flex items-baseline justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-display text-base truncate">{it.product_name}</p>
                    <p className="text-[11px] font-mono text-ink-muted">×{it.quantity}</p>
                  </div>
                  <span className="font-mono nums-lining tabular-nums">{formatCLP(it.total_price)}</span>
                </li>
              ))}
            </ul>
            <div className="border-t border-rule pt-4 flex justify-between items-baseline">
              <span className="font-display text-base">Total</span>
              <span className="font-display text-2xl nums-lining tabular-nums">{formatCLP(order.total)}</span>
            </div>
            <div className="mt-5 pt-5 border-t border-rule-soft text-xs text-ink-muted space-y-1">
              <p><span className="text-ink-muted">Entrega:</span> {order.shipping_method === "pickup" ? "Retiro en farmacia" : "Despacho a domicilio"}</p>
              {order.shipping_address && (
                <p>{order.shipping_address}, {order.shipping_city}</p>
              )}
              <p className="font-mono nums-lining">{order.shipping_phone}</p>
            </div>
          </div>

          <WhatsAppButton order={{ id: order.id, folio: order.folio, total: order.total }} />

          <OrderTimeline events={events} status={order.status} />
        </aside>
      </section>
    </>
  );
}

function Step({ n, label, active = false, done = false }: { n: string; label: string; active?: boolean; done?: boolean }) {
  return (
    <li className="flex items-baseline gap-3 shrink-0">
      <span className={"editorial-numeral text-lg " + (active ? "text-ink" : done ? "text-forest" : "text-ink-subtle")}>
        {done ? "✓" : n}
      </span>
      <span className={"font-mono text-[11px] uppercase tracking-widest " + (active ? "text-ink" : done ? "text-forest" : "text-ink-subtle")}>
        {label}
      </span>
    </li>
  );
}

function DataLine({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-rule-soft pb-3">
      <dt className="text-[11px] uppercase tracking-widest text-ink-muted shrink-0">{label}</dt>
      <dd className={"text-sm text-ink text-right " + (mono ? "font-mono nums-lining" : "")}>{value}</dd>
    </div>
  );
}
