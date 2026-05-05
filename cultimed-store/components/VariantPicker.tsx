"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart";
import { formatCLP } from "@/lib/format";

export interface Variant {
  id: number;
  sku: string;
  presentation: string | null;
  default_price: number;
  total_stock: number;
}

interface Props {
  productName: string;
  category: string;
  variants: Variant[];
  initialVariantId: number;
}

/**
 * Selector de gramaje (5g/10g/20g, 10ml/30ml, etc.) con add-to-cart integrado.
 * El backend sigue tratando cada variante como product_id distinto — solo agrupamos en frontend.
 */
export default function VariantPicker({ productName, category, variants, initialVariantId }: Props) {
  const router = useRouter();
  const { add } = useCart();
  const [activeId, setActiveId] = useState<number>(
    variants.find((v) => v.id === initialVariantId)?.id ?? variants[0].id
  );
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  const active = variants.find((v) => v.id === activeId)!;
  const maxStock = active.total_stock;

  function handleAdd(goToCart: boolean) {
    if (maxStock <= 0) return;
    add({
      productId: active.id,
      sku: active.sku,
      name: productName,
      presentation: active.presentation,
      unitPrice: active.default_price,
      quantity: qty,
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
      {/* Variant pills */}
      {variants.length > 1 && (
        <div>
          <p className="eyebrow mb-3">— Formato</p>
          <div className="flex flex-wrap gap-2">
            {variants.map((v) => {
              const isActive = v.id === activeId;
              const oos = v.total_stock <= 0;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => { setActiveId(v.id); setQty(1); }}
                  disabled={oos}
                  className={
                    "px-4 py-2 text-xs uppercase tracking-widest font-mono border transition-all duration-200 nums-lining " +
                    (isActive
                      ? "bg-ink text-paper border-ink"
                      : oos
                      ? "bg-transparent text-ink-subtle border-rule-soft cursor-not-allowed line-through"
                      : "bg-transparent text-ink border-rule hover:border-ink")
                  }
                >
                  {v.presentation || "—"}
                  {oos && " · agotado"}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Price + stock */}
      <div className="flex items-baseline justify-between">
        <span className="eyebrow">— Precio</span>
        {maxStock > 0 ? (
          <span className="pill-stock">En stock · {maxStock} unid.</span>
        ) : (
          <span className="pill-editorial text-ink-muted">Agotado</span>
        )}
      </div>
      <p className="font-display text-5xl font-light tabular-nums nums-lining -mt-3">
        {formatCLP(active.default_price)}
      </p>

      {maxStock > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <p className="eyebrow shrink-0">— Cantidad</p>
            <div className="flex items-center border border-rule">
              <button
                type="button"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="w-10 h-10 flex items-center justify-center hover:bg-paper-dim transition-colors"
                aria-label="Disminuir"
              >−</button>
              <span className="w-12 text-center font-mono nums-lining">{qty}</span>
              <button
                type="button"
                onClick={() => setQty((q) => Math.min(maxStock, q + 1))}
                className="w-10 h-10 flex items-center justify-center hover:bg-paper-dim transition-colors"
                aria-label="Aumentar"
              >+</button>
            </div>
            <span className="text-[11px] font-mono uppercase tracking-widest text-ink-muted ml-auto">
              máx. {maxStock}
            </span>
          </div>
          <button
            type="button"
            onClick={() => handleAdd(false)}
            className="btn-brass w-full"
          >
            {added ? "✓ Añadido al carrito" : `Añadir ${active.presentation || ""} al carrito`.trim()}
          </button>
          <button
            type="button"
            onClick={() => handleAdd(true)}
            className="btn-link w-full justify-center"
          >
            Comprar ahora →
          </button>
        </div>
      ) : null}
    </div>
  );
}
