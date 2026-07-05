"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCart, lineTotal } from "@/lib/cart";
import { formatCLP } from "@/lib/format";
import { calcShippingFee, FREE_SHIPPING_THRESHOLD, OUTLYING_SHIPPING_FEE, URBAN_SHIPPING_FEE } from "@/lib/shipping";
import { isNativeApp } from "@/lib/capacitor";
import type { CustomerAccount } from "@/lib/auth";

const TRANSFER_DISCOUNT_PCT = 10;
const CHECKOUT_WEB_URL = "https://dispensariocultimed.cl/checkout";

export default function CheckoutClient({ customer }: { customer: CustomerAccount }) {
  const router = useRouter();
  const { items, hydrated, subtotal, clear } = useCart();
  const [submitting, setSubmitting] = useState(false);
  const [shippingMethod] = useState<"courier">("courier");
  const [shippingCity, setShippingCity] = useState("");
  const [shippingRegion, setShippingRegion] = useState("RM");
  const [error, setError] = useState<string | null>(null);
  const [isNative, setIsNative] = useState(false);

  // Google Play prohibe el carrito/pago de cannabis 100% nativo -- si esto
  // corre dentro del shell de Capacitor, el pago se completa en el
  // navegador del sistema (Safari/Chrome), no en este WebView.
  useEffect(() => {
    setIsNative(isNativeApp());
  }, []);

  const transferDiscount = Math.round((subtotal * TRANSFER_DISCOUNT_PCT) / 100);
  const shippingFee = calcShippingFee(subtotal, shippingCity, shippingRegion);
  const finalTotal = Math.max(0, subtotal - transferDiscount + shippingFee);
  const shippingIsFree = shippingFee === 0;

  async function handleContinueInBrowser() {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url: CHECKOUT_WEB_URL });
  }

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
      if (res.status === 401) {
        router.push("/ingresar?next=" + encodeURIComponent("/checkout"));
        return;
      }
      if (!res.ok || !json.orderId) {
        if (json.error === "out_of_stock" && Array.isArray(json.detail)) {
          throw new Error(
            "Algunos productos ya no tienen stock suficiente:\n" + json.detail.join("\n") +
            "\nAjusta tu carrito e intenta de nuevo."
          );
        }
        throw new Error(json.error || "Error");
      }
      clear();
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

  if (isNative) {
    return (
      <section className="max-w-[1440px] mx-auto px-6 lg:px-12 py-16 lg:py-24">
        <div className="max-w-xl mx-auto text-center">
          <h1 className="font-display text-display-2 leading-[0.98] text-balance mb-6">
            <span className="font-light">Un paso más,</span>{" "}
            <span className="italic font-normal">en tu navegador</span>
            <span className="font-light">.</span>
          </h1>
          <p className="text-base text-ink-muted leading-relaxed mb-10">
            Para completar tu pedido con transferencia bancaria, continúa en el navegador de tu
            celular. Tu carrito y tu sesión se mantienen — vuelves a la app cuando termines.
          </p>
          <ul className="divide-y divide-rule-soft border-y border-rule mb-8 text-left">
            {items.map((it) => (
              <li key={it.productId} className="py-3 flex justify-between items-baseline gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-display truncate">{it.name}</p>
                  <p className="text-[11px] font-mono text-ink-muted">×{it.quantity}</p>
                </div>
                <span className="text-sm font-mono nums-lining tabular-nums shrink-0">
                  {formatCLP(lineTotal(it))}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex items-baseline justify-between mb-8">
            <span className="font-display text-lg">Subtotal</span>
            <span className="font-display text-2xl nums-lining tabular-nums">{formatCLP(subtotal)}</span>
          </div>
          <button type="button" onClick={handleContinueInBrowser} className="btn-brass w-full mb-3">
            Continuar en el navegador →
          </button>
          <Link href="/carrito" className="btn-link w-full justify-center">
            Volver al carrito ←
          </Link>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="max-w-[1440px] mx-auto px-6 lg:px-12 pt-12 lg:pt-16 pb-8">
        <ol className="flex items-baseline gap-6 lg:gap-12">
          <Step n="01" label="Información" active />
          <span className="hairline flex-1" />
          <Step n="02" label="Transferencia" />
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
          <div className="mb-8 p-5 bg-sangria/10 border-l-2 border-sangria whitespace-pre-line">
            <p className="eyebrow text-sangria mb-1">— Error</p>
            <p className="text-sm text-ink">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid grid-cols-12 gap-x-6 gap-y-10">
          <div className="col-span-12 lg:col-span-7 space-y-10">
            <div>
              <p className="eyebrow mb-4 flex items-baseline gap-3">
                <span className="editorial-numeral text-base text-ink-subtle">— A</span>
                <span>Dirección de despacho</span>
              </p>
              <div className="space-y-4">
                <input name="shipping_address" required className="input-editorial" placeholder="Calle, número, depto." />
                <div className="grid grid-cols-2 gap-4">
                  <input
                    name="shipping_city"
                    required
                    className="input-editorial"
                    placeholder="Comuna"
                    value={shippingCity}
                    onChange={(e) => setShippingCity(e.currentTarget.value)}
                  />
                  <input
                    name="shipping_region"
                    required
                    className="input-editorial"
                    placeholder="RM"
                    value={shippingRegion}
                    onChange={(e) => setShippingRegion(e.currentTarget.value)}
                  />
                </div>
              </div>
            </div>

            <div>
              <p className="eyebrow mb-4 flex items-baseline gap-3">
                <span className="editorial-numeral text-base text-ink-subtle">— B</span>
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
            </div>

            <div>
              <p className="eyebrow mb-4 flex items-baseline gap-3">
                <span className="editorial-numeral text-base text-ink-subtle">— C</span>
                <span>Pago por transferencia</span>
              </p>
              <div className="border border-ink bg-ink/5 p-5">
                <p className="font-display text-xl mb-2">Transferencia bancaria</p>
                <p className="text-xs text-ink-muted leading-relaxed">
                  Pago directo con <strong>{TRANSFER_DISCOUNT_PCT}% de descuento</strong>. Subes tu comprobante después y confirmamos en 4h hábiles.
                </p>
              </div>
            </div>

            <div>
              <p className="eyebrow mb-4 flex items-baseline gap-3">
                <span className="editorial-numeral text-base text-ink-subtle">— D</span>
                <span>Notas (opcional)</span>
              </p>
              <textarea name="notes" rows={3} className="input-editorial resize-none" placeholder="Indicaciones especiales, horarios..." />
            </div>
          </div>

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
                      {formatCLP(lineTotal(it))}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="border-t border-rule pt-4 space-y-2 mb-5">
                <div className="flex justify-between items-baseline text-sm">
                  <span className="text-ink-muted">Subtotal</span>
                  <span className="font-mono nums-lining tabular-nums">{formatCLP(subtotal)}</span>
                </div>
                {transferDiscount > 0 && (
                  <div className="flex justify-between items-baseline text-sm text-forest">
                    <span>– {TRANSFER_DISCOUNT_PCT}% transferencia</span>
                    <span className="font-mono nums-lining tabular-nums">−{formatCLP(transferDiscount)}</span>
                  </div>
                )}
                <div className="flex justify-between items-baseline text-sm">
                  <span className="text-ink-muted">Despacho</span>
                  <span className="font-mono nums-lining tabular-nums">
                    {shippingIsFree ? "Gratis" : formatCLP(shippingFee)}
                  </span>
                </div>
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
                {submitting ? "Creando orden…" : "Generar orden de pago →"}
              </button>
              <p className="text-[11px] font-mono leading-relaxed text-ink-muted mt-5">
                Al continuar generamos tu folio y te mostramos los datos para transferir. Despacho urbano {formatCLP(URBAN_SHIPPING_FEE)}; zonas fuera de Santiago urbano {formatCLP(OUTLYING_SHIPPING_FEE)}; gratis sobre {formatCLP(FREE_SHIPPING_THRESHOLD)}.
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