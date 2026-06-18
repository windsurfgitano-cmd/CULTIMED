import { cookies } from "next/headers";
import crypto from "node:crypto";

const COOKIE_NAME = "cultisoft_totp_enroll";
const MAX_AGE_SEC = 15 * 60; // 15 min para completar enrolamiento

function getSecret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const isProd = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
  if (isProd) throw new Error("SESSION_SECRET es obligatorio en producción (cultisoft)");
  return "dev-secret-change-in-production-please";
}

function sign(data: string): string {
  return crypto.createHmac("sha256", getSecret()).update(data).digest("hex");
}

export function setTotpCandidateSecret(secret: string): void {
  const payload = Buffer.from(secret).toString("base64url");
  const sig = sign(payload);
  cookies().set(COOKIE_NAME, `${payload}.${sig}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
}

export function getTotpCandidateSecret(): string | null {
  const raw = cookies().get(COOKIE_NAME)?.value;
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig || sign(payload) !== sig) return null;
  try {
    return Buffer.from(payload, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

export function clearTotpCandidateSecret(): void {
  cookies().delete(COOKIE_NAME);
}