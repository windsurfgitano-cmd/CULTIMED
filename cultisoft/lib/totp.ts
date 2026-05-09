// TOTP (RFC 6238) helpers para 2FA.
// Compatible con Google Authenticator, Authy, 1Password, Bitwarden.
import { generateSecret as gen, generateURI, verifySync, generate as gen6 } from "otplib";

const APP_NAME = "Cultimed";

/** Genera un secret nuevo (base32). */
export function generateSecret(): string {
  return gen({ length: 20 });
}

/** URI compatible con apps TOTP (otpauth://). Usar para generar QR. */
export function generateOtpauthUrl(email: string, secret: string): string {
  return generateURI({ secret, label: email, issuer: APP_NAME });
}

/** Verifica que el código de 6 dígitos sea válido para el secret. Acepta paso anterior y siguiente (±30s). */
export function verifyToken(token: string, secret: string): boolean {
  const clean = (token || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  try {
    // verifySync devuelve VerifyResult — chequeamos current step + previous + next manualmente
    const now = Math.floor(Date.now() / 1000 / 30);
    for (const step of [now - 1, now, now + 1]) {
      try {
        const expected = (gen6 as any)({ secret, counter: step });
        if (typeof expected === "string" && expected === clean) return true;
        if (expected && typeof expected === "object" && expected.token === clean) return true;
      } catch (_e) { /* try next step */ }
    }
    // Fallback: verifySync directo
    const r = verifySync({ token: clean, secret });
    return Boolean((r as any)?.valid ?? r);
  } catch {
    return false;
  }
}
