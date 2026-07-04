// Escalera de precios por gramo — mismo código en cultisoft y cultimed-store.
// Ver docs/superpowers/specs/2026-07-04-venta-por-gramo-design.md sección B.

export interface PriceTier {
  desde_g: number;
  precio_g: number;
}

/**
 * Lee la columna jsonb `products.price_tiers`. postgres-js normalmente ya
 * la entrega como array parseado, pero por si llega como string (mismo caso
 * defensivo que patient-compliance.ts hace con prescription_ocr_data) lo
 * parseamos igual. Devuelve null si el producto no vende por tramos.
 */
export function parsePriceTiers(raw: unknown): PriceTier[] | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length > 0 ? (parsed as PriceTier[]) : null;
    } catch {
      return null;
    }
  }
  if (Array.isArray(raw)) return raw.length > 0 ? (raw as PriceTier[]) : null;
  return null;
}

/**
 * Precio total por comprar `gramos` gramos, según la tarifa del tramo más
 * alto alcanzado aplicada a TODA la compra (no marginal por tramo).
 * Ej: tiers = [1→8998, 6→8599, 11→7999.5, 21→7500], gramos=7 → 7 × 8599.
 */
export function calcularPrecioGramos(gramos: number, tiers: PriceTier[]): number {
  const ordenado = [...tiers].sort((a, b) => a.desde_g - b.desde_g).reverse();
  const tramo = ordenado.find((t) => gramos >= t.desde_g) ?? ordenado[ordenado.length - 1];
  return Math.round(gramos * tramo.precio_g);
}
