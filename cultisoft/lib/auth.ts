import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { get, run } from "./db";

const COOKIE_NAME = "cultisoft_session";
const SECRET =
  process.env.SESSION_SECRET || "dev-secret-change-in-production-please";
const MAX_AGE_DAYS = 7;

export type StaffRole = "admin" | "doctor" | "dispenser" | "pharmacist";

export interface StaffUser {
  id: number;
  email: string;
  full_name: string;
  role: StaffRole;
  professional_license: string | null;
  is_active: number;
}

export interface SessionData {
  staffId: number;
  iat: number;
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

export async function login(email: string, password: string): Promise<StaffUser | null> {
  const staff = get<StaffUser & { password_hash: string }>(
    `SELECT id, email, full_name, role, professional_license, is_active, password_hash
     FROM staff WHERE email = ? AND is_active = 1`,
    email.trim().toLowerCase()
  );
  if (!staff) return null;
  const ok = await bcrypt.compare(password, staff.password_hash);
  if (!ok) return null;

  run(`UPDATE staff SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?`, staff.id);

  const token = encodeSession({ staffId: staff.id, iat: Date.now() });
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_DAYS * 24 * 60 * 60,
  });

  // strip password_hash
  const { password_hash, ...user } = staff;
  return user;
}

export function logout() {
  cookies().delete(COOKIE_NAME);
}

export function getCurrentStaff(): StaffUser | null {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  const session = decodeSession(token);
  if (!session) return null;

  const staff = get<StaffUser>(
    `SELECT id, email, full_name, role, professional_license, is_active
     FROM staff WHERE id = ? AND is_active = 1`,
    session.staffId
  );
  return staff || null;
}

export function requireStaff(): StaffUser {
  const staff = getCurrentStaff();
  if (!staff) redirect("/login");
  return staff;
}

export function requireRole(...roles: StaffRole[]): StaffUser {
  const staff = requireStaff();
  if (!roles.includes(staff.role)) {
    redirect("/dashboard?denied=1");
  }
  return staff;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}
