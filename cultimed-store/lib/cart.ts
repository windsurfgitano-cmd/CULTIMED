"use client";

import { useCallback, useEffect, useState } from "react";

export interface CartItem {
  productId: number;
  sku: string;
  name: string;
  presentation: string | null;
  unitPrice: number;
  quantity: number;
  imageUrl?: string | null;
}

const STORAGE_KEY = "cultimed_cart_v1";

function read(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CartItem[]) : [];
  } catch { return []; }
}

function write(items: CartItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent("cultimed:cart-change", { detail: items }));
}

export function useCart() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setItems(read());
    setHydrated(true);
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<CartItem[]>).detail;
      setItems(detail);
    };
    window.addEventListener("cultimed:cart-change", handler);
    return () => window.removeEventListener("cultimed:cart-change", handler);
  }, []);

  const add = useCallback((item: Omit<CartItem, "quantity"> & { quantity?: number }) => {
    const cur = read();
    const existing = cur.find((i) => i.productId === item.productId);
    if (existing) {
      existing.quantity += item.quantity ?? 1;
    } else {
      cur.push({ ...item, quantity: item.quantity ?? 1 });
    }
    write(cur);
  }, []);

  const update = useCallback((productId: number, quantity: number) => {
    const cur = read();
    const item = cur.find((i) => i.productId === productId);
    if (!item) return;
    if (quantity <= 0) {
      write(cur.filter((i) => i.productId !== productId));
    } else {
      item.quantity = quantity;
      write([...cur]);
    }
  }, []);

  const remove = useCallback((productId: number) => {
    write(read().filter((i) => i.productId !== productId));
  }, []);

  const clear = useCallback(() => write([]), []);

  const subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const count = items.reduce((s, i) => s + i.quantity, 0);

  return { items, hydrated, add, update, remove, clear, subtotal, count };
}
