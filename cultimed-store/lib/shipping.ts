export const FREE_SHIPPING_THRESHOLD = 100000;
export const URBAN_SHIPPING_FEE = 4990;
export const OUTLYING_SHIPPING_FEE = 9990;

const OUTLYING_RM_COMMUNES = new Set([
  "buin",
  "calera de tango",
  "colina",
  "curacavi",
  "el monte",
  "isla de maipo",
  "lampa",
  "maria pinto",
  "melipilla",
  "padre hurtado",
  "paine",
  "penaflor",
  "pirque",
  "san jose de maipo",
  "talagante",
  "tiltil",
]);

const RM_ALIASES = new Set([
  "rm",
  "region metropolitana",
  "metropolitana",
  "santiago",
]);

function normalizeLocation(value: string | null | undefined): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function isOutlyingShippingZone(city: string | null | undefined, region?: string | null): boolean {
  const normalizedRegion = normalizeLocation(region);
  if (normalizedRegion && !RM_ALIASES.has(normalizedRegion)) return true;
  return OUTLYING_RM_COMMUNES.has(normalizeLocation(city));
}

export function calcShippingFee(subtotal: number, city: string | null | undefined, region?: string | null): number {
  if (subtotal > FREE_SHIPPING_THRESHOLD) return 0;
  return isOutlyingShippingZone(city, region) ? OUTLYING_SHIPPING_FEE : URBAN_SHIPPING_FEE;
}
