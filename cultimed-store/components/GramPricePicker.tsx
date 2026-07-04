"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart";
import { formatCLP } from "@/lib/format";
import { calcularPrecioGramos, type PriceTier } from "@/lib/pricing";

interface Props {
  productId: number;
  sku: string;
  productName: string;
  presentation: string | null;
  tiers: PriceTier[];
  totalStock: number;
}

export default function GramPricePicker({ productId, sku, productName, presentation, tiers, totalStock }: Props) {
  const router = useRouter();
  const { add } = useCart();
  const [grams, setGrams] = useState(1);
  const [added, setAdded] = useState(false);

  const sortedTiers = [...tiers].sort((a, b) => a.desde_g - b.desde_g);
  const activeTier = [...sortedTiers].reverse().find((t) => grams >= t.desde_g) ?? sortedTiers[0];
  const total = calcularPrecioGramos(grams, tiers);

  function handleAdd(goToCart: boolean) {
    if (totalStock <= 0) return;
    add({
      productId,
      sku,
      name: productName,
      presentation,
      unitPrice: activeTier.precio_g,
      quantity: grams,
      priceTiers: tiers,
    });
    setAdded(true);
    if (goToCart) {
      setTimeout(() => router.push("/carrito"), 300);
    } else {
      setTimeout(() => setAdded(false), 2000);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <span className="eyebrow">— Precio</span>
        {totalStock > 0 ? (
          <span className="pill-stock">En stock · {totalStock} g</span>
        ) : (
          <span className="pill-editorial text-ink-muted">Agotado</span>
        )}
      </div>
      <p className="font-display text-5xl font-light tabular-nums nums-lining -mt-3">
        {formatCLP(total)}
      </p>
      <p className="text-xs font-mono uppercase tracking-widest text-ink-muted">
        Tramo {activeTier.desde_g}g+ · {formatCLP(activeTier.precio_g)}/g
      </p>

      {totalStock > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <p className="eyebrow shrink-0">— Gramos</p>
            <div className="flex items-center border border-rule">
              <button
                type="button"
                onClick={() => setGrams((g) => Math.max(1, g - 1))}
                className="w-10 h-10 flex items-center justify-center hover:bg-paper-dim transition-colors"
                aria-label="Disminuir"
              >−</button>
              <span className="w-12 text-center font-mono nums-lining">{grams}g</span>
              <button
                type="button"
                onClick={() => setGrams((g) => Math.min(totalStock, g + 1))}
                className="w-10 h-10 flex items-center justify-center hover:bg-paper-dim transition-colors"
                aria-label="Aumentar"
              >+</button>
            </div>
            <span className="text-[11px] font-mono uppercase tracking-widest text-ink-muted ml-auto">
              máx. {totalStock}g
            </span>
          </div>
          <button type="button" onClick={() => handleAdd(false)} className="btn-brass w-full">
            {added ? "✓ Añadido al carrito" : `Añadir ${grams}g al carrito`}
          </button>
          <button type="button" onClick={() => handleAdd(true)} className="btn-link w-full justify-center">
            Comprar ahora →
          </button>

          <div className="pt-4 border-t border-rule-soft">
            <p className="text-[11px] font-mono uppercase tracking-widest text-ink-muted mb-2">
              — Escalera de precios
            </p>
            <ul className="text-xs font-mono text-ink-muted space-y-1">
              {sortedTiers.map((t, i) => {
                const next = sortedTiers[i + 1];
                const label = next ? `${t.desde_g}–${next.desde_g - 1}g` : `${t.desde_g}g+`;
                const isActive = t.desde_g === activeTier.desde_g;
                return (
                  <li key={t.desde_g} className={isActive ? "text-ink font-semibold" : ""}>
                    {label} · {formatCLP(t.precio_g)}/g
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
