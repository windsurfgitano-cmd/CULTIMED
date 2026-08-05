import { OUTLYING_COMUNA_KEYS, normalizeComuna } from "./comunas-rm";

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

// Sin envio gratis ni descuento por volumen: siempre se cobra la tarifa de la
// zona, sea cual sea el subtotal del pedido.
export function calcShippingFee(city: string | null | undefined, region?: string | null): number {
  return isOutlyingShippingZone(city, region) ? OUTLYING_SHIPPING_FEE : URBAN_SHIPPING_FEE;
}
