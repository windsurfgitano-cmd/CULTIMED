"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart";
import { formatCLP } from "@/lib/format";

export default function CartPage() {
  const { items, hydrated, update, remove, subtotal, count } = useCart();

  return (
    <section className="max-w-[1440px] mx-auto px-6 lg:px-12 py-12 lg:py-20 min-h-[60vh]">
      <div className="flex items-baseline gap-6 mb-8 lg:mb-12">
        <span className="editorial-numeral text-2xl text-ink-subtle">— Carrito</span>
        {hydrated && count > 0 && (
          <span className="eyebrow">{count} {count === 1 ? "producto" : "productos"}</span>
        )}
      </div>

      <h1 className="font-display text-display-2 leading-[0.98] mb-12 lg:mb-16 text-balance">
        <span className="font-light">Tu</span>{" "}
        <span className="italic font-normal">selección</span>
        <span className="font-light">.</span>
      </h1>

      {!hydrated ? (
        <div className="py-32" />
      ) : items.length === 0 ? (
        <div className="border-y border-rule py-24 lg:py-32 text-center">
          <p className="font-display text-3xl italic text-ink-muted mb-6">El carrito está vacío.</p>
          <Link href="/productos" className="btn-link">Explorar catálogo →</Link>
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-x-6 gap-y-12">
          {/* Items */}
          <div className="col-span-12 lg:col-span-7">
            <ul className="border-y border-rule divide-y divide-rule-soft">
              {items.map((it) => (
                <li key={it.productId} className="grid grid-cols-12 gap-x-4 py-6 lg:py-8 items-baseline">
                  <div className="col-span-12 sm:col-span-6">
                    <p className="text-[11px] uppercase tracking-widest font-mono text-ink-muted mb-1">{it.sku}</p>
                    <p className="font-display text-2xl">
                      <span className="font-light">{it.name.split(" ")[0]}</span>{" "}
                      <span className="italic font-normal">{it.name.split(" ").slice(1).join(" ")}</span>
                    </p>
                    {it.presentation && <p className="text-xs text-ink-muted mt-1">{it.presentation}</p>}
                  </div>
                  <div className="col-span-6 sm:col-span-3 mt-3 sm:mt-0">
                    <div className="flex items-center border border-rule w-fit">
                      <button onClick={() => update(it.productId, it.quantity - 1)} className="w-9 h-9 flex items-center justify-center hover:bg-paper-dim transition-colors">−</button>
                      <span className="w-10 text-center font-mono nums-lining text-sm">{it.quantity}</span>
                      <button onClick={() => update(it.productId, it.quantity + 1)} className="w-9 h-9 flex items-center justify-center hover:bg-paper-dim transition-colors">+</button>
                    </div>
                  </div>
                  <div className="col-span-6 sm:col-span-2 sm:text-right mt-3 sm:mt-0">
                    <p className="font-mono text-base nums-lining tabular-nums">{formatCLP(it.unitPrice * it.quantity)}</p>
                  </div>
                  <div className="col-span-12 sm:col-span-1 sm:text-right">
                    <button
                      onClick={() => remove(it.productId)}
                      className="text-[10px] uppercase tracking-widest font-mono text-ink-muted hover:text-sangria transition-colors mt-3 sm:mt-0"
                    >
                      Quitar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Summary */}
          <aside className="col-span-12 lg:col-span-4 lg:col-start-9">
            <div className="lg:sticky lg:top-32 border border-rule bg-paper-bright p-7 lg:p-8">
              <p className="eyebrow mb-6">— Resumen de orden</p>

              <dl className="space-y-3 text-sm pb-6 border-b border-rule">
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Subtotal</dt>
                  <dd className="font-mono nums-lining">{formatCLP(subtotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Despacho</dt>
                  <dd className="font-mono italic text-ink-muted">A definir</dd>
                </div>
              </dl>

              <div className="flex items-baseline justify-between pt-6 mb-7">
                <dt className="font-display text-xl">Total</dt>
                <dd className="font-display text-3xl nums-lining tabular-nums">{formatCLP(subtotal)}</dd>
              </div>

              <Link href="/checkout" className="btn-brass w-full mb-3">
                Continuar al pago →
              </Link>
              <Link href="/productos" className="btn-link w-full justify-center">
                Seguir mirando ←
              </Link>

              <p className="text-[11px] font-mono leading-relaxed text-ink-muted mt-6 pt-6 border-t border-rule-soft">
                El pago se realiza por transferencia bancaria. Recibirás los datos al continuar.
                Tu pedido se prepara una vez confirmado el comprobante por nuestro equipo (típicamente
                en menos de 24h hábiles).
              </p>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
