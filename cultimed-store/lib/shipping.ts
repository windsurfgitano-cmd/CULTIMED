import { OUTLYING_COMUNA_KEYS, normalizeComuna } from "./comunas-rm";

export const FREE_SHIPPING_THRESHOLD = 100000;
export const URBAN_SHIPPING_FEE = 4990;
export const OUTLYING_SHIPPING_FEE = 9990;

// Alias de la RM: si la región es la RM, la tarifa la decide la comuna;
// cualquier otra región (data histórica — hoy solo despachamos RM) → alejada.
const RM_ALIASES = new Set([
  "rm",
  "region metropolitana",
  "metropolitana",
  "santiago",
]);

export function isOutlyingShippingZone(city: string | null | undefined, region?: string | null): boolean {
  const normalizedRegion = normalizeComuna(region);
  if (normalizedRegion && !RM_ALIASES.has(normalizedRegion)) return true;
  return OUTLYING_COMUNA_KEYS.has(normalizeComuna(city));
}

export function calcShippingFee(subtotal: number, city: string | null | undefined, region?: string | null): number {
  if (subtotal > FREE_SHIPPING_THRESHOLD) return 0;
  return isOutlyingShippingZone(city, region) ? OUTLYING_SHIPPING_FEE : URBAN_SHIPPING_FEE;
}
