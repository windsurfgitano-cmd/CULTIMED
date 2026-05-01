// Password reset flow - tokens HMAC con expiración 1h.
// Funciona para customer_accounts (clientes). Para staff usar admin reset manual.

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { get, run, transaction } from "./db";

export const TOKEN_TTL_HOURS = 1;
export type AccountType = "customer" | "staff";

/** Genera un token aleatorio + retorna el hash para guardar en BD. */
export function generateResetToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString("base64url");
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  return { token, hash };
}

/** Verifica si un token coincide con el hash guardado. */
export function verifyTokenHash(token: string, hash: string): boolean {
  const actual = crypto.createHash("sha256").update(token).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(hash));
}

/** Crea token de reset para un email (customer). Retorna el token plano para enviar por email. */
export async function createCustomerResetToken(opts: {
  email: string;
  ip?: string;
}): Promise<{ token: string; accountId: number; email: string } | null> {
  const acc = await get<{ id: number; email: string }>(
    `SELECT id, email FROM customer_accounts WHERE email = ?`,
    opts.email.trim().toLowerCase()
  );
  if (!acc) return null;

  // Anti-abuse: invalida tokens previos de la misma cuenta antes de crear uno nuevo.
  await run(
    `UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP
     WHERE account_type = ? AND account_id = ? AND used_at IS NULL`,
    "customer", acc.id
  );

  const { token, hash } = generateResetToken();
  await run(
    `INSERT INTO password_reset_tokens
       (account_type, account_id, token_hash, expires_at, requested_ip)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP + (INTERVAL '1 hour' * ?), ?)`,
    "customer", acc.id, hash, TOKEN_TTL_HOURS, opts.ip || null
  );

  return { token, accountId: acc.id, email: acc.email };
}

/** Valida un token (sin consumirlo) y retorna el account_id si es válido. */
export async function validateResetToken(token: string): Promise<{
  accountId: number;
  accountType: AccountType;
  email: string;
} | null> {
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const row = await get<{
    id: number;
    account_id: number;
    account_type: string;
    email: string;
  }>(
    `SELECT t.id, t.account_id, t.account_type,
       CASE t.account_type
         WHEN 'customer' THEN (SELECT email FROM customer_accounts WHERE id = t.account_id)
         WHEN 'staff' THEN (SELECT email FROM staff WHERE id = t.account_id)
       END AS email
     FROM password_reset_tokens t
     WHERE t.token_hash = ? AND t.used_at IS NULL AND t.expires_at > CURRENT_TIMESTAMP`,
    hash
  );
  if (!row) return null;
  return {
    accountId: row.account_id,
    accountType: row.account_type as AccountType,
    email: row.email,
  };
}

/** Consume un token válido y cambia la contraseña del paciente. */
export async function consumeTokenAndResetPassword(opts: {
  token: string;
  newPassword: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (opts.newPassword.length < 6) return { ok: false, error: "weak_password" };

  const valid = await validateResetToken(opts.token);
  if (!valid) return { ok: false, error: "invalid_or_expired" };

  const newHash = await bcrypt.hash(opts.newPassword, 10);
  const tokenHash = crypto.createHash("sha256").update(opts.token).digest("hex");

  await transaction(async (tx) => {
    await tx.run(
      `UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE token_hash = ?`,
      tokenHash
    );
    if (valid.accountType === "customer") {
      await tx.run(
        `UPDATE customer_accounts SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        newHash, valid.accountId
      );
    } else {
      await tx.run(
        `UPDATE staff SET password_hash = ? WHERE id = ?`,
        newHash, valid.accountId
      );
    }
  });

  return { ok: true };
}

/** Admin: genera token de reset para cliente o staff (vista admin). */
export async function adminGenerateResetToken(opts: {
  accountType: AccountType;
  accountId: number;
  ip?: string;
}): Promise<string> {
  const { token, hash } = generateResetToken();
  await run(
    `INSERT INTO password_reset_tokens
       (account_type, account_id, token_hash, expires_at, requested_ip)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP + (INTERVAL '1 hour' * ?), ?)`,
    opts.accountType, opts.accountId, hash, TOKEN_TTL_HOURS, opts.ip || "admin-generated"
  );
  return token;
}
