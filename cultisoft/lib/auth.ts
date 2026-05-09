import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { get, run } from "./db";

const COOKIE_NAME = "cultisoft_session";
const SECRET =
  process.env.SESSION_SECRET || "dev-secret-change-in-production-please";
const MAX_AGE_DAYS = 7;

export type StaffRole = "superadmin" | "admin" | "doctor" | "dispenser" | "pharmacist";

export interface StaffUser {
  id: number;
  email: string;
  full_name: string;
  role: StaffRole;
  professional_license: string | null;
  is_active: number;
  totp_enabled?: number;
}

/** True si el staff puede gestionar el sistema (super admin) — solo gestión de staff/auditoría sistema. */
export function isSuperadmin(staff: { role: string } | null | undefined): boolean {
  return staff?.role === "superadmin";
}

/** True si el staff puede hacer cualquier acción "admin" (incluye superadmin). Para gating de páginas operativas. */
export function isAdminOrAbove(staff: { role: string } | null | undefined): boolean {
  return staff?.role === "admin" || staff?.role === "superadmin";
}

export interface SessionData {
  staffId: number;
  iat: number;
  /** Si true, falta verificar TOTP — la sesión NO da acceso aún a las páginas. */
  locked?: boolean;
}

function sign(data: string): string {
  return crypto.createHmac("sha256", SECRET).update(data).digest("hex");
}

function encodeSession(session: SessionData): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

function decodeSession(token: string): SessionData | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  if (sign(payload) !== sig) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as SessionData;
    const ageMs = Date.now() - data.iat;
    if (ageMs > MAX_AGE_DAYS * 24 * 60 * 60 * 1000) return null;
    return data;
  } catch {
    return null;
  }
}

export async function login(email: string, password: string): Promise<{ ok: true; user: StaffUser; needsTotp: boolean } | null> {
  const staff = await get<StaffUser & { password_hash: string; totp_enabled: number }>(
    `SELECT id, email, full_name, role, professional_license, is_active, password_hash, totp_enabled
     FROM staff WHERE email = ? AND is_active = 1`,
    email.trim().toLowerCase()
  );
  if (!staff) return null;
  const ok = await bcrypt.compare(password, staff.password_hash);
  if (!ok) return null;

  const needsTotp = staff.totp_enabled === 1;

  // Si tiene 2FA activado, sesión queda "locked" — solo desbloquea con código TOTP válido.
  // No actualizamos last_login_at hasta que se complete el segundo factor.
  if (!needsTotp) {
    await run(`UPDATE staff SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?`, staff.id);
  }

  const token = encodeSession({ staffId: staff.id, iat: Date.now(), locked: needsTotp });
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_DAYS * 24 * 60 * 60,
  });

  const { password_hash, ...user } = staff;
  return { ok: true, user, needsTotp };
}

/** Tras verificar TOTP exitosamente, desbloquea la sesión re-emitiendo cookie sin locked. */
export async function unlockSession(): Promise<boolean> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return false;
  const session = decodeSession(token);
  if (!session) return false;

  const newToken = encodeSession({ staffId: session.staffId, iat: Date.now() });
  cookies().set(COOKIE_NAME, newToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_DAYS * 24 * 60 * 60,
  });
  await run(`UPDATE staff SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?`, session.staffId);
  return true;
}

export function logout() {
  cookies().delete(COOKIE_NAME);
}

export async function getCurrentStaff(): Promise<StaffUser | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  const session = decodeSession(token);
  if (!session) return null;
  // Sesión locked = login pasó pero falta TOTP → no da acceso a páginas
  if (session.locked) return null;

  const staff = await get<StaffUser>(
    `SELECT id, email, full_name, role, professional_license, is_active, totp_enabled
     FROM staff WHERE id = ? AND is_active = 1`,
    session.staffId
  );
  return staff || null;
}

/** Devuelve el staff cuando la sesión está locked (post-password, pre-TOTP). Para /login/2fa. */
export async function getLockedStaff(): Promise<StaffUser | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  const session = decodeSession(token);
  if (!session || !session.locked) return null;

  const staff = await get<StaffUser>(
    `SELECT id, email, full_name, role, professional_license, is_active, totp_enabled
     FROM staff WHERE id = ? AND is_active = 1`,
    session.staffId
  );
  return staff || null;
}

export async function requireStaff(): Promise<StaffUser> {
  const staff = await getCurrentStaff();
  if (!staff) {
    // Si está locked (esperando TOTP), redirige a la página de verificación
    const locked = await getLockedStaff();
    if (locked) redirect("/login/2fa");
    redirect("/login");
  }
  return staff;
}

export async function requireRole(...roles: StaffRole[]): Promise<StaffUser> {
  const staff = await requireStaff();
  if (!roles.includes(staff.role)) {
    redirect("/dashboard?denied=1");
  }
  return staff;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}
