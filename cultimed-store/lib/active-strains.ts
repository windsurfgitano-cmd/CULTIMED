// Nombres comerciales normalizados para mostrar en el storefront.
export const STRAIN_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  "gaslight-purple-ghost-sativa-dominante-lit-farm": "Gaslight · Purple Ghost (Sativa dominante)",
  "bourbon-street-lit-farms": "Bourbon Street · LIT Farms",
  "aceite-sublingual-calma": "Aceite Sublingual Calma",
  "the-hive-bloom-seed-co": "The Hive · Bloom Seed Co.",
  "dulce-de-fresa-bloom-seed-co": "Dulce de Fresa · Bloom Seed Co.",
  "predispensado-cereal-milk-cookies-powerzzz-genetics": "Cereal Milk · Cookies x Powerzzz Genetics",
  "wedding-cake-ndica-dominante---litfarms": "Wedding Cake · Lit Farms",
};

export function displayStrainName(strainKey: string | null | undefined, fallbackName: string): string {
  const fromKey = strainKey ? STRAIN_DISPLAY_NAMES[strainKey] : null;
  return fromKey || fallbackName.replace(/^\(PREDISPENSADO\)\s*/i, "").replace(/\s*\(([^)]+)\)\s*$/, "").trim();
}
