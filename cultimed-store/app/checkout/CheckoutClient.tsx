"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCart } from "@/lib/cart";
import { formatCLP } from "@/lib/format";
import type { CustomerAccount } from "@/lib/auth";

const TRANSFER_DISCOUNT_PCT = 10; // matches lib/payments.ts

export default function CheckoutClient({
  customer,
  mpEnabled,
}: {
  customer: CustomerAccount;
  mpEnabled: boolean;
}) {
  const router = useRouter();
  const { items, hydrated, subtotal, clear } = useCart();
  const [submitting, setSubmitting] = useState(false);
  const [shippingMethod, setShippingMethod] = useState<"pickup" | "courier">("pickup");
  const [paymentMethod, setPaymentMethod] = useState<"transfer" | "mercadopago">("transfer");
  const [error, setError] = useState<string | null>(null);

  const transferDiscount = Math.round((subtotal * TRANSFER_DISCOUNT_PCT) / 100);
  const finalTotal = paymentMethod === "transfer" ? subtotal - transferDiscount : subtotal;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (items.length === 0) return;
    setSubmitting(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    const payload = {
      shipping_method: shippingMethod,
      shipping_address: String(fd.get("shipping_address") || ""),
      shipping_city: String(fd.get("shipping_city") || ""),
      shipping_region: String(fd.get("shipping_region") || ""),
      shipping_phone: String(fd.get("shipping_phone") || customer.phone || ""),
      notes: String(fd.get("notes") || ""),
      payment_method: paymentMethod,
      items: items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
      })),
    };

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.orderId) throw new Error(json.error || "Error");
      clear();

      // Si MercadoPago, redirigimos al checkout de MP
      if (paymentMethod === "mercadopago" && json.mpInitPoint) {
        window.location.href = json.mpInitPoint;
        return;
      }

      router.push(`/checkout/${json.orderId}`);
    } catch (err: any) {
      setError(err.message || "No pudimos crear tu pedido. Intenta de nuevo.");
      setSubmitting(false);
    }
  }

  if (hydrated && items.length === 0) {
    return (
      <section className="max-w-[1440px] mx-auto px-6 lg:px-12 py-24 text-center">
        <p className="font-display text-3xl italic text-ink-muted mb-6">El carrito está vacío.</p>
        <Link href="/productos" className="btn-link">Volver al catálogo →</Link>
      </section>
    );
  }

  return (
    <>
      {/* Stepper */}
      <section className="max-w-[1440px] mx-auto px-6 lg:px-12 pt-12 lg:pt-16 pb-8">
        <ol className="flex items-baseline gap-6 lg:gap-12">
          <Step n="01" label="Información" active />
          <span className="hairline flex-1" />
          <Step n="02" label={paymentMethod === "transfer" ? "Transferencia" : "MercadoPago"} />
          <span className="hairline flex-1" />
          <Step n="03" label="Confirmación" />
        </ol>
      </section>

      <section className="max-w-[1440px] mx-auto px-6 lg:px-12 pb-16 lg:pb-24">
        <div className="mb-10 lg:mb-14">
          <h1 className="font-display text-display-2 leading-[0.98] text-balance">
            <span className="font-light">Datos de</span>{" "}
            <span className="italic font-normal">despacho</span>
            <span className="font-light">.</span>
          </h1>
        </div>

        {error && (
          <div className="mb-8 p-5 bg-sangria/10 border-l-2 border-sangria">
            <p className="text-sm text-ink">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid grid-cols-12 gap-x-6 gap-y-12">
          <div className="col-span-12 lg:col-span-7 space-y-10">
            {/* Shipping method */}
            <div>
              <p className="eyebrow mb-4 flex items-baseline gap-3">
                <span className="editorial-numeral text-base text-ink-subtle">— A</span>
                <span>Método de entrega</span>
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Option
                  selected={shippingMethod === "pickup"}
                  onSelect={() => setShippingMethod("pickup")}
                  title="Retiro en farmacia"
                  body="Av. Providencia · Lun–Vie 10–19, Sáb 10–14"
                  cost="Sin costo"
                />
                <Option
                  selected={shippingMethod === "courier"}
                  onSelect={() => setShippingMethod("courier")}
                  title="Despacho a domicilio"
                  body="Courier privado · 24–72h hábiles desde la dispensación"
                  cost="Cotización al confirmar"
                />
              </div>
            </div>

            {/* Address (only for courier) */}
            {shippingMethod === "courier" && (
              <div className="space-y-7 animate-fade-up">
                <p className="eyebrow flex items-baseline gap-3">
                  <span className="editorial-numeral text-base text-ink-subtle">— B</span>
                  <span>Dirección de entrega</span>
                </p>
                <div>
                  <label className="input-label">Calle, número y depto</label>
                  <input name="shipping_address" required className="input-editorial" placeholder="Av. Providencia 1234, Dpto 502" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-7">
                  <div>
                    <label className="input-label">Comuna</label>
                    <input name="shipping_city" required className="input-editorial" placeholder="Providencia" />
                  </div>
                  <div>
                    <label className="input-label">Región</label>
                    <input name="shipping_region" required className="input-editorial" placeholder="RM" />
                  </div>
                </div>
              </div>
            )}

            {/* Phone */}
            <div>
              <p className="eyebrow mb-4 flex items-baseline gap-3">
                <span className="editorial-numeral text-base text-ink-subtle">— {shippingMethod === "courier" ? "C" : "B"}</span>
                <span>Teléfono · WhatsApp</span>
              </p>
              <input
                name="shipping_phone"
                type="tel"
                required
                defaultValue={customer.phone || ""}
                className="input-editorial"
                placeholder="+56 9 XXXX XXXX"
              />
              <p className="text-[11px] font-mono text-ink-muted mt-2">
                Te avisaremos por WhatsApp cuando confirmemos tu pago y cuando el pedido esté listo.
              </p>
            </div>

            {/* PAYMENT METHOD */}
            <div>
              <p className="eyebrow mb-4 flex items-baseline gap-3">
                <span className="editorial-numeral text-base text-ink-subtle">— {shippingMethod === "courier" ? "D" : "C"}</span>
                <span>Método de pago</span>
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Option
                  selected={paymentMethod === "transfer"}
                  onSelect={() => setPaymentMethod("transfer")}
                  title="Transferencia bancaria"
                  body="Pago directo, mejor precio. Subes tu comprobante después y confirmamos en 4h hábiles."
                  cost={`–${TRANSFER_DISCOUNT_PCT}% off`}
                  highlight
                />
                {mpEnabled ? (
                  <Option
                    selected={paymentMethod === "mercadopago"}
                    onSelect={() => setPaymentMethod("mercadopago")}
                    title="MercadoPago"
                    body="Tarjeta débito o crédito. Confirmación instantánea, sin esperar."
                    cost="Precio normal"
                  />
                ) : (
                  <DisabledOption
                    title="MercadoPago"
                    body="Próximamente · pago automático con tarjeta."
                  />
                )}
              </div>
            </div>

            {/* Notes */}
            <div>
              <p className="eyebrow mb-4 flex items-baseline gap-3">
                <span className="editorial-numeral text-base text-ink-subtle">— {shippingMethod === "courier" ? "E" : "D"}</span>
                <span>Notas (opcional)</span>
              </p>
              <textarea name="notes" rows={3} className="input-editorial resize-none" placeholder="Indicaciones especiales, horarios..." />
            </div>
          </div>

          {/* Summary */}
          <aside className="col-span-12 lg:col-span-4 lg:col-start-9">
            <div className="lg:sticky lg:top-32 border border-rule bg-paper-bright p-7">
              <p className="eyebrow mb-5">— Tu orden</p>
              <ul className="divide-y divide-rule-soft mb-5">
                {items.map((it) => (
                  <li key={it.productId} className="py-3 flex justify-between items-baseline gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-display truncate">{it.name}</p>
                      <p className="text-[11px] font-mono text-ink-muted">×{it.quantity}</p>
                    </div>
                    <span className="text-sm font-mono nums-lining tabular-nums shrink-0">
                      {formatCLP(it.unitPrice * it.quantity)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="border-t border-rule pt-4 space-y-2 mb-5">
                <div className="flex justify-between items-baseline text-sm">
                  <span className="text-ink-muted">Subtotal</span>
                  <span className="font-mono nums-lining tabular-nums">{formatCLP(subtotal)}</span>
                </div>
                {paymentMethod === "transfer" && transferDiscount > 0 && (
                  <div className="flex justify-between items-baseline text-sm text-forest">
                    <span>– {TRANSFER_DISCOUNT_PCT}% transferencia</span>
                    <span className="font-mono nums-lining tabular-nums">−{formatCLP(transferDiscount)}</span>
                  </div>
                )}
                <div className="flex justify-between items-baseline pt-3 border-t border-rule-soft">
                  <span className="font-display text-lg">Total a pagar</span>
                  <span className="font-display text-3xl nums-lining tabular-nums">{formatCLP(finalTotal)}</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || items.length === 0}
                className="btn-brass w-full disabled:opacity-50"
              >
                {submitting
                  ? (paymentMethod === "mercadopago" ? "Conectando con MercadoPago..." : "Creando orden...")
                  : (paymentMethod === "mercadopago" ? "Pagar con MercadoPago →" : "Generar orden de pago →")}
              </button>
              <p className="text-[11px] font-mono leading-relaxed text-ink-muted mt-5">
                {paymentMethod === "transfer"
                  ? "Al continuar generamos tu folio y te mostramos los datos para transferir. Recibirás confirmación por WhatsApp y email."
                  : "Te redirigiremos a MercadoPago para completar el pago. Recibirás confirmación inmediata."}
              </p>
            </div>
          </aside>
        </form>
      </section>
    </>
  );
}

function Step({ n, label, active = false }: { n: string; label: string; active?: boolean }) {
  return (
    <li className="flex items-baseline gap-3 shrink-0">
      <span className={"editorial-numeral text-lg " + (active ? "text-ink" : "text-ink-subtle")}>{n}</span>
      <span className={"font-mono text-[11px] uppercase tracking-widest " + (active ? "text-ink" : "text-ink-subtle")}>
        {label}
      </span>
    </li>
  );
}

function Option({
  selected,
  onSelect,
  title,
  body,
  cost,
  highlight = false,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  body: string;
  cost: string;
  highlight?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={
        "text-left p-5 border transition-all duration-300 " +
        (selected
          ? "border-ink bg-ink/5"
          : "border-rule hover:border-ink-muted")
      }
    >
      <div className="flex items-baseline justify-between mb-1">
        <p className="font-display text-xl">{title}</p>
        <span className={"w-3.5 h-3.5 rounded-full border " + (selected ? "border-ink bg-ink" : "border-ink/30")} />
      </div>
      <p className="text-xs text-ink-muted mb-3 leading-relaxed">{body}</p>
      <p className={
        "text-[11px] uppercase tracking-widest font-mono " +
        (highlight ? "text-forest font-semibold" : "text-ink-muted")
      }>
        {cost}
      </p>
    </button>
  );
}

function DisabledOption({ title, body }: { title: string; body: string }) {
  return (
    <div className="text-left p-5 border border-rule-soft bg-paper-dim/30 cursor-not-allowed opacity-60">
      <div className="flex items-baseline justify-between mb-1">
        <p className="font-display text-xl">{title}</p>
        <span className="text-[10px] font-mono uppercase tracking-widest text-ink-subtle">Próximamente</span>
      </div>
      <p className="text-xs text-ink-muted leading-relaxed">{body}</p>
    </div>
  );
}
