export const DEFAULT_MONTHLY_GRAM_LIMIT = 30;

const GRAM_RE = /(\d+(?:[.,]\d+)?)\s*g\b/i;
const ML_RE = /(\d+(?:[.,]\d+)?)\s*ml\b/i;

function parseAmount(raw: string): number {
  const n = parseFloat(raw.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function combinedText(presentation: string | null, name: string | null): string {
  return `${presentation || ""} ${name || ""}`.trim();
}

function isFlowerCategory(presentation: string | null, name: string | null): boolean {
  const text = combinedText(presentation, name).toLowerCase();
  return (
    /\bflor(es)?\b/.test(text) ||
    /\bflower\b/.test(text) ||
    /\bcannabis\b/.test(text) ||
    /\bflores\b/.test(text)
  );
}

function isOilOrMl(presentation: string | null, name: string | null): boolean {
  const text = combinedText(presentation, name).toLowerCase();
  return /\bml\b/.test(text) || /\baceite\b/.test(text) || /\boil\b/.test(text);
}

/**
 * Estima gramos totales de una línea (presentación × cantidad).
 * Flor: parsea "5g", "10 g", "flor 5g". Aceite/ml: 1 ml ≈ 1 g.
 * Sin hint en flor controlada: quantity × 1 g por unidad.
 */
export function parseGramsPerUnit(
  presentation: string | null,
  name: string | null,
  quantity: number
): number {
  const text = combinedText(presentation, name);
  const qty = Math.max(0, Number(quantity) || 0);
  if (qty === 0) return 0;

  const gramMatch = text.match(GRAM_RE);
  if (gramMatch) {
    return parseAmount(gramMatch[1]) * qty;
  }

  const mlMatch = text.match(ML_RE);
  if (mlMatch) {
    return parseAmount(mlMatch[1]) * qty;
  }

  if (isOilOrMl(presentation, name)) {
    return qty;
  }

  if (isFlowerCategory(presentation, name)) {
    return qty;
  }

  return 0;
}

/** Clave de mes calendario: YYYY-MM */
export function monthKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}