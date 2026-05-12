"use client";

import { useMemo, useState } from "react";

interface ProductOption {
  id: number;
  sku: string;
  name: string;
  default_price: number;
  category: string;
  total_stock: number;
}

interface Row {
  key: string;
  product_id: number;
  quantity: number;
}

export default function ManualOrderRowsClient({ products }: { products: ProductOption[] }) {
  const [rows, setRows] = useState<Row[]>([{ key: crypto.randomUUID(), product_id: 0, quantity: 1 }]);

  const productsById = useMemo(() => {
    const m = new Map<number, ProductOption>();
    products.forEach((p) => m.set(p.id, p));
    return m;
  }, [products]);

  const total = rows.reduce((s, r) => {
    const p = productsById.get(r.product_id);
    if (!p) return s;
    return s + p.default_price * r.quantity;
  }, 0);

  function addRow() {
    setRows((r) => [...r, { key: crypto.randomUUID(), product_id: 0, quantity: 1 }]);
  }
  function removeRow(key: string) {
    setRows((r) => r.length === 1 ? r : r.filter((x) => x.key !== key));
  }
  function updateRow(key: string, field: "product_id" | "quantity", value: number) {
    setRows((r) => r.map((x) => x.key === key ? { ...x, [field]: value } : x));
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const product = productsById.get(row.product_id);
        const lineTotal = product ? product.default_price * row.quantity : 0;
        const stockWarning = product && product.total_stock < row.quantity;
        const outOfStock = product && product.total_stock === 0;

        return (
          <div key={row.key} className="grid grid-cols-12 gap-3 items-end border border-rule-soft bg-paper-dim/30 p-3">
            <div className="col-span-12 md:col-span-7">
              <label className="input-label">Producto</label>
              <select
                name="item_product_id"
                value={row.product_id}
                onChange={(e) => updateRow(row.key, "product_id", Number(e.target.value))}
                className="input-field"
                required
              >
                <option value="0">— Selecciona producto —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id} disabled={p.total_stock === 0}>
                    {p.name} · {p.sku} · {p.total_stock} stock · ${p.default_price.toLocaleString("es-CL")}
                    {p.total_stock === 0 ? " · AGOTADO" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-6 md:col-span-2">
              <label className="input-label">Cantidad</label>
              <input
                type="number"
                name="item_quantity"
                value={row.quantity}
                onChange={(e) => updateRow(row.key, "quantity", Math.max(1, Number(e.target.value) || 1))}
                min={1}
                className="input-field nums-lining"
              />
            </div>
            <div className="col-span-4 md:col-span-2 text-right">
              <p className="text-[10px] uppercase tracking-widest font-mono text-on-surface-variant mb-1">Subtotal</p>
              <p className="font-mono text-sm nums-lining">${lineTotal.toLocaleString("es-CL")}</p>
            </div>
            <div className="col-span-2 md:col-span-1 flex justify-end">
              <button
                type="button"
                onClick={() => removeRow(row.key)}
                disabled={rows.length === 1}
                className="text-error hover:bg-error-container/30 rounded p-2 disabled:opacity-30 disabled:cursor-not-allowed"
                title="Quitar"
              >
                <span className="material-symbols-outlined text-[20px]">remove_circle</span>
              </button>
            </div>
            {stockWarning && !outOfStock && (
              <div className="col-span-12 text-[11px] text-warning">
                ⚠ Stock disponible: {product!.total_stock}. La orden se crea igual pero faltará reservar inventario.
              </div>
            )}
            {outOfStock && (
              <div className="col-span-12 text-[11px] text-error">
                ✗ Sin stock. Selecciona otro producto o reabastece.
              </div>
            )}
          </div>
        );
      })}

      <div className="flex items-center justify-between pt-3 border-t border-rule">
        <button
          type="button"
          onClick={addRow}
          className="btn-secondary text-xs"
        >
          <span className="material-symbols-outlined text-base">add_circle</span>
          Agregar item
        </button>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-widest font-mono text-on-surface-variant">Total estimado</p>
          <p className="font-display text-2xl font-bold nums-lining">${total.toLocaleString("es-CL")}</p>
        </div>
      </div>
    </div>
  );
}
