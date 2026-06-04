// Cepas activas para venta en el storefront.
// Cuando se quiera volver a activar una cepa: agregarla al set y aplicar
// supabase/activate-strain.sql (que la pone is_active=1 y shopify_status='active').

export const ACTIVE_STRAIN_KEYS: ReadonlySet<string> = new Set([
  "gaslight-purple-ghost-sativa-dominante-lit-farm",
  "bourbon-street-lit-farms",
]);

export const ACTIVE_STRAIN_DISPLAY: Readonly<Record<string, string>> = {
  "gaslight-purple-ghost-sativa-dominante-lit-farm": "Gaslight · Purple Ghost (Sativa dominante)",
  "bourbon-street-lit-farms": "Bourbon Street · LIT Farms",
};

export const STRAIN_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  ...ACTIVE_STRAIN_DISPLAY,
  "the-hive-bloom-seed-co": "The Hive · Bloom Seed Co.",
  "dulce-de-fresa-bloom-seed-co": "Dulce de Fresa · Bloom Seed Co.",
  "predispensado-cereal-milk-cookies-powerzzz-genetics": "Cereal Milk · Cookies x Powerzzz Genetics",
  "wedding-cake-ndica-dominante---litfarms": "Wedding Cake · Lit Farms",
  "aceite-sublingual-calma": "Aceite Sublingual Calma",
};

export function isActiveStrain(strainKey: string | null | undefined): boolean {
  if (!strainKey) return false;
  return ACTIVE_STRAIN_KEYS.has(strainKey);
}

// Filtra filas a solo cepas activas. Las filas sin strain_key (legacy) se descartan
// por seguridad: no podemos garantizar que correspondan a una cepa permitida.
export function filterActiveStrains<T extends { strain_key: string | null }>(rows: T[]): T[] {
  return rows.filter((r) => isActiveStrain(r.strain_key));
}

export function displayStrainName(strainKey: string | null | undefined, fallbackName: string): string {
  const fromKey = strainKey ? STRAIN_DISPLAY_NAMES[strainKey] : null;
  return fromKey || fallbackName.replace(/^\(PREDISPENSADO\)\s*/i, "").replace(/\s*\(([^)]+)\)\s*$/, "").trim();
}
