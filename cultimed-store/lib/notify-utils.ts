// Mismo código en cultisoft y cultimed-store — sincronizar ambas copias a mano.
// Funciones puras del sistema de notificaciones. SIN imports de la app —
// este archivo debe poder correr bajo tsx sin resolver alias "@/".
import crypto from "node:crypto";

// Guard perezoso: lanza al FIRMAR/VERIFICAR en producción sin SESSION_SECRET,
// pero importar el módulo (p. ej. solo por normalizePhoneCL) nunca lanza.
function getSecret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const isProd = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
  if (isProd) throw new Error("SESSION_SECRET es obligatorio en producción para tokens de baja");
  return "dev-secret-change-please";
}

/**
 * Normaliza un teléfono chileno a E.164 (+569XXXXXXXX).
 * Acepta: "+56 9 1234 5678", "9 1234 5678", "912345678", "56912345678", con puntos/guiones.
 * Devuelve null si no es un celular chileno reconocible (los SMS solo van a celulares).
 */
export function normalizePhoneCL(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, "");
  let rest: string;
  if (digits.startsWith("569") && digits.length === 11) rest = digits.slice(2);
  else if (digits.startsWith("9") && digits.length === 9) rest = digits;
  else return null;
  return `+56${rest}`;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", getSecret()).update(`unsub:${payload}`).digest("hex").slice(0, 32);
}

/** Token de baja de marketing: "<accountId>.<hmac>" — sin login, un clic. */
export function makeUnsubscribeToken(accountId: number): string {
  const payload = String(accountId);
  return `${payload}.${sign(payload)}`;
}

export function verifyUnsubscribeToken(token: string | null | undefined): number | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (sig.length !== expected.length) return null;
  // compara la representación hex ASCII en tiempo constante (equivalente a comparar los bytes)
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const id = Number(payload);
  return Number.isInteger(id) && id > 0 ? id : null;
}
