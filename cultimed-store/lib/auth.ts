import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { get, run } from "./db";

const COOKIE_NAME = "cultimed_customer";
const SECRET = process.env.SESSION_SECRET || "dev-secret-change-please";
const MAX_AGE_DAYS = 14;

export interface CustomerAccount {
  id: number;
  email: string;
  full_name: string | null;
  rut: string | null;
  phone: string | null;
  patient_id: number | null;
  prescription_status: "none" | "pending" | "aprobada" | "rechazada" | "expired";
  prescription_url: string | null;
  age_gate_accepted_at: string | null;
}

interface SessionData { id: number; iat: number; }

function sign(s: string): string {
  return crypto.createHmac("sha256", SECRET).update(s).digest("hex");
}
function encode(s: SessionData): string {
  const payload = Buffer.from(JSON.stringify(s)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}
function decode(t: string): SessionData | null {
  const [p, sig] = t.split(".");
  if (!p || !sig || sign(p) !== sig) return null;
  try {
    const d = JSON.parse(Buffer.from(p, "base64url").toString()) as SessionData;
    if (Date.now() - d.iat > MAX_AGE_DAYS * 86400_000) return null;
    return d;
  } catch { return null; }
}

export async function registerCustomer(input: {
  email: string;
  password: string;
  full_name: string;
  rut?: string;
  phone?: string;
}): Promise<CustomerAccount | { error: string }> {
  const email = input.email.trim().toLowerCase();
  if (!email || !input.password) return { error: "missing" };
  if (input.password.length < 6) return { error: "weak_password" };

  const existing = await get<{ id: number }>(`SELECT id FROM customer_accounts WHERE email = ?`, email);
  if (existing) return { error: "duplicate_email" };

  const hash = await bcrypt.hash(input.password, 10);
  const result = await run(
    `INSERT INTO customer_accounts (email, password_hash, full_name, rut, phone, age_gate_accepted_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    email, hash, input.full_name.trim(), input.rut || null, input.phone || null
  );
  setCookie(Number(result.lastInsertRowid));
  return (await getCurrentCustomer())!;
}

export async function loginCustomer(email: string, password: string): Promise<CustomerAccount | null> {
  const acc = await get<CustomerAccount & { password_hash: string }>(
    `SELECT * FROM customer_accounts WHERE email = ?`,
    email.trim().toLowerCase()
  );
  if (!acc) return null;
  const ok = await bcrypt.compare(password, acc.password_hash);
  if (!ok) return null;
  setCookie(acc.id);
  const { password_hash, ...rest } = acc as any;
  return rest;
}

function setCookie(id: number) {
  const token = encode({ id, iat: Date.now() });
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_DAYS * 86400,
  });
}

export function logoutCustomer() {
  cookies().delete(COOKIE_NAME);
}

export async function getCurrentCustomer(): Promise<CustomerAccount | null> {
  const t = cookies().get(COOKIE_NAME)?.value;
  if (!t) return null;
  const s = decode(t);
  if (!s) return null;
  return (await get<CustomerAccount>(
    `SELECT id, email, full_name, rut, phone, patient_id, prescription_status,
       prescription_url, age_gate_accepted_at
     FROM customer_accounts WHERE id = ?`,
    s.id
  )) || null;
}

export async function requireCustomer(): Promise<CustomerAccount> {
  const c = await getCurrentCustomer();
  if (!c) redirect("/ingresar?next=" + encodeURIComponent("/mi-cuenta"));
  return c;
}

export function canPurchase(c: CustomerAccount | null): boolean {
  return !!c && c.prescription_status === "aprobada";
}
