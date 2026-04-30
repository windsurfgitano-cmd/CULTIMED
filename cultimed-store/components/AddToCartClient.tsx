"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart";

interface Props {
  product: {
    productId: number;
    sku: string;
    name: string;
    presentation: string | null;
    unitPrice: number;
  };
  maxStock: number;
}

export default function AddToCartClient({ product, maxStock }: Props) {
  const router = useRouter();
  const { add } = useCart();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  function handleAdd(goToCart: boolean) {
    add({ ...product, quantity: qty });
    setAdded(true);
    if (goToCart) {
      setTimeout(() => router.push("/carrito"), 300);
    } else {
      setTimeout(() => setAdded(false), 2000);
    }
  }

  return (
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
        {added ? "✓ Añadido al carrito" : "Añadir al carrito"}
      </button>
      <button
        type="button"
        onClick={() => handleAdd(true)}
        className="btn-link w-full justify-center"
      >
        Comprar ahora →
      </button>
    </div>
  );
}
