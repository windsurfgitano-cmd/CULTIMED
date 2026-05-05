// Cron Vercel: ejecuta el batch de migración Shopify→Cultimed.
// Se dispara desde Vercel Cron (header `Authorization: Bearer ${CRON_SECRET}`)
// O manualmente con curl + MIGRATION_SECRET.
//
// Idempotente: si ya corrió completo, retorna 200 con { skipped: "already_run" }.
//
// Schedule en vercel.json. Customer list lee desde data/migration-customers.json (committed).
import { NextResponse, type NextRequest } from "next/server";
import { getSql } from "@/lib/db";
import crypto from "node:crypto";

// PII customer list NO va en git. Se fetch desde Supabase Storage (bucket privado "migrations")
// usando SUPABASE_SERVICE_ROLE_KEY.
async function fetchCustomers(): Promise<Customer[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars missing");
  const res = await fetch(`${url}/storage/v1/object/migrations/customers.json`, {
    headers: { Authorization: `Bearer ${key}`, apikey: key },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`fetch customers.json: ${res.status}`);
  return (await res.json()) as Customer[];
}

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — suficiente para 104 emails

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || "Cultimed <no-reply@dispensariocultimed.cl>";
const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO || "contacto@dispensariocultimed.cl";
const PUBLIC_BASE = process.env.NEXT_PUBLIC_BASE_URL || "https://dispensariocultimed.cl";
const HERO_IMAGE = "https://ibkhvopshhlbvjwrmuzm.supabase.co/storage/v1/object/public/email-assets/apothecary-hero.png";
const LOGO_IMAGE = "https://ibkhvopshhlbvjwrmuzm.supabase.co/storage/v1/object/public/email-assets/cultimed-logo-gold.png";
const TOKEN_TTL_DAYS = 7;
const SKIP_EMAILS = new Set(["contacto@dispensariocultimed.cl", "rincondeoz@gmail.com"]);

interface Customer {
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  rut: string | null;
  is_approved: boolean;
}

function buildEmailHtml(opts: { firstName: string | null; link: string; isApproved: boolean }) {
  const { firstName, link, isApproved } = opts;
  const greeting = firstName ? `${firstName.split(" ")[0]},` : "Hola.";
  const heroSubtitle = isApproved
    ? "Tu cuenta migró. Tu receta sigue activa."
    : "Una nueva plataforma. Tu acceso, intacto.";
  const bodyApproved = `<p style="margin:0 0 16px;">${greeting}</p><p style="margin:0 0 16px;">Cultimed se mudó a una plataforma propia, hecha a la medida del dispensario. La construimos con un sólo principio: que la dispensación de cannabis medicinal en Chile se sienta como debiera sentirse — clínica, discreta, precisa.</p><p style="margin:0 0 16px;">Tu cuenta ya viaja con nosotros. <strong>Tu receta médica anterior sigue reconocida</strong> — el químico farmacéutico ya la validó. Solo falta que definas una contraseña nueva para empezar a usarla.</p><p style="margin:0;color:#7a7066;font-size:14px;font-style:italic;">El enlace es válido por 7 días y solo puede usarse una vez.</p>`;
  const bodyNew = `<p style="margin:0 0 16px;">${greeting}</p><p style="margin:0 0 16px;">Cultimed se mudó a una plataforma propia, hecha a la medida del dispensario. La construimos con un sólo principio: que la dispensación de cannabis medicinal en Chile se sienta como debiera sentirse — clínica, discreta, precisa.</p><p style="margin:0 0 16px;">Tu cuenta ya viaja con nosotros, pero todavía no estás del todo activado. Necesitas dos cosas: <strong>definir tu contraseña</strong> y <strong>cargar una receta médica vigente</strong> para que nuestro químico farmacéutico la valide.</p><p style="margin:0;color:#7a7066;font-size:14px;font-style:italic;">El enlace para definir tu contraseña dura 7 días.</p>`;
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Migración Cultimed</title></head><body style="margin:0;padding:0;background:#0F1A22;font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;-webkit-font-smoothing:antialiased;"><div style="display:none;visibility:hidden;mso-hide:all;font-size:1px;color:#0F1A22;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">Cultimed migró. Tu cuenta está lista — define tu contraseña en 30 segundos.</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#0F1A22;"><tr><td align="center" style="padding:48px 16px;"><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background:#F7F1E5;border:1px solid #C9B891;"><tr><td align="center" style="padding:36px 48px 24px;background:#F7F1E5;"><img src="${LOGO_IMAGE}" alt="Cultimed · Cultivando Salud" width="160" style="display:block;width:160px;max-width:60%;height:auto;border:0;margin:0 auto;" /></td></tr><tr><td style="padding:0;line-height:0;"><img src="${HERO_IMAGE}" alt="Cultimed · Dispensario de cannabis medicinal" width="600" style="display:block;width:100%;height:auto;border:0;" /></td></tr><tr><td style="padding:36px 48px 24px;background:#F7F1E5;"><p style="margin:0 0 12px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:#8b7d5c;">Cultimed · Dispensario clínico</p><h1 style="margin:0 0 6px;font-family:Georgia,serif;font-size:36px;font-weight:300;line-height:1.05;color:#1a1a1a;letter-spacing:-0.5px;">${isApproved ? "Tu cuenta" : "Una nueva"} <em style="font-style:italic;font-weight:400;color:#1a1a1a;">${isApproved ? "migró" : "plataforma"}</em>.</h1><p style="margin:0;font-family:Georgia,serif;font-size:18px;font-style:italic;color:#5d544a;line-height:1.4;">${heroSubtitle}</p></td></tr><tr><td style="padding:0 48px 32px;background:#F7F1E5;font-family:Georgia,serif;font-size:16px;line-height:1.65;color:#3a3530;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:28px;"><tr><td style="height:1px;background:#C9B891;line-height:1px;font-size:1px;">&nbsp;</td></tr></table>${isApproved ? bodyApproved : bodyNew}<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:36px auto 16px;"><tr><td align="center" style="background:#0F1A22;border:1px solid #0F1A22;"><a href="${link}" style="display:inline-block;padding:18px 44px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:#F7F1E5;text-decoration:none;">Definir mi contraseña</a></td></tr></table><p style="margin:8px 0 0;text-align:center;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;color:#8b7d5c;letter-spacing:0.3px;">o copia este enlace en tu navegador<br><span style="word-break:break-all;color:#5d544a;">${link}</span></p></td></tr><tr><td style="padding:0 48px 32px;background:#F7F1E5;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#FBF5E8;border-left:3px solid #B89968;"><tr><td style="padding:18px 22px;font-family:Georgia,serif;font-size:14px;line-height:1.6;color:#3a3530;"><p style="margin:0 0 4px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#8b7d5c;">— ${isApproved ? "Tu receta sigue activa" : "Receta requerida"}</p>${isApproved ? "La receta médica que validamos en la plataforma anterior se trasladó automáticamente. No necesitas volver a subirla." : "Después de definir tu contraseña, sube una receta médica vigente (PDF, JPG o PNG, máx 8 MB). Nuestro químico farmacéutico la valida en menos de 24 horas hábiles."}</td></tr></table></td></tr><tr><td style="padding:28px 48px 36px;background:#F7F1E5;border-top:1px solid #C9B891;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;line-height:1.7;color:#8b7d5c;letter-spacing:0.2px;"><p style="margin:0 0 12px;">¿Dudas o no esperabas este mensaje? Escríbenos a <a href="mailto:contacto@dispensariocultimed.cl" style="color:#5d544a;text-decoration:underline;">contacto@dispensariocultimed.cl</a></p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="padding-top:8px;border-top:1px solid #DCD3C4;"><p style="margin:0;font-size:10px;color:#9c8e6e;letter-spacing:0.3px;"><strong style="color:#5d544a;">Cultimed</strong> · Asociación de Usuarios de Plantas Medicinales<br>Operamos bajo Ley 20.850 y normativa SANNA · Datos clínicos protegidos bajo Ley 19.628<br><a href="https://dispensariocultimed.cl" style="color:#8b7d5c;text-decoration:none;">dispensariocultimed.cl</a></p></td></tr></table></td></tr></table><p style="margin:24px 0 0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;color:#5d544a;letter-spacing:0.3px;">Recibiste este correo porque eres paciente registrado en Cultimed.</p></td></tr></table></body></html>`;
}

function buildEmailText(opts: { firstName: string | null; link: string; isApproved: boolean }) {
  const { firstName, link, isApproved } = opts;
  const g = firstName ? `${firstName.split(" ")[0]},` : "Hola.";
  if (isApproved) {
    return `${g}\n\nCultimed se mudó a una plataforma propia. Tu cuenta migró con nosotros y tu receta médica anterior sigue reconocida — solo necesitas definir una contraseña nueva.\n\nDefinir mi contraseña:\n${link}\n\nEl enlace es válido por 7 días.\n\n¿Dudas? contacto@dispensariocultimed.cl\n\nCultimed · dispensariocultimed.cl`;
  }
  return `${g}\n\nCultimed se mudó a una plataforma propia. Tu cuenta migró con nosotros, pero todavía no está del todo activada. Necesitas:\n\n1. Definir tu contraseña en este enlace (válido 7 días):\n   ${link}\n\n2. Después, cargar una receta médica vigente para que nuestro químico farmacéutico la valide.\n\n¿Dudas? contacto@dispensariocultimed.cl\n\nCultimed · dispensariocultimed.cl`;
}

async function sendEmail(to: string, subject: string, html: string, text: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: EMAIL_FROM, to: [to], reply_to: EMAIL_REPLY_TO, subject, html, text }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false as const, error: body?.message || `HTTP ${res.status}` };
  return { ok: true as const, id: body.id as string };
}

async function runMigration(opts: { limit?: number; dryRun?: boolean; customers: Customer[] }) {
  const { limit = Infinity, dryRun = false, customers: list } = opts;
  const stats = {
    total: 0,
    skipped_no_email: 0,
    skipped_company: 0,
    skipped_already_exists: 0,
    created_approved: 0,
    created_pending: 0,
    email_ok: 0,
    email_failed: 0,
    errors: [] as string[],
  };

  for (const c of list) {
    if (stats.total >= limit) break;
    if (!c.email) { stats.skipped_no_email++; continue; }
    if (SKIP_EMAILS.has(c.email)) { stats.skipped_company++; continue; }
    stats.total++;

    try {
      const sql = getSql();
      const exists = await sql<{ id: number }[]>`SELECT id FROM customer_accounts WHERE email = ${c.email}`;
      if (exists.length > 0) {
        stats.skipped_already_exists++;
        continue;
      }

      const status = c.is_approved ? "aprobada" : "none";
      const fullName = [c.first_name, c.last_name].filter(Boolean).join(" ");

      let token: string;
      if (dryRun) {
        token = "dry-" + crypto.randomBytes(8).toString("hex");
      } else {
        const created = await sql<{ id: number }[]>`
          INSERT INTO customer_accounts (email, password_hash, full_name, rut, phone, prescription_status)
          VALUES (${c.email}, ${""}, ${fullName}, ${c.rut}, ${c.phone || null}, ${status})
          RETURNING id
        `;
        const accountId = created[0].id;
        const rawToken = crypto.randomBytes(32).toString("base64url");
        const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
        await sql`
          INSERT INTO password_reset_tokens (account_type, account_id, token_hash, expires_at, requested_ip)
          VALUES ('customer', ${accountId}, ${tokenHash},
                  CURRENT_TIMESTAMP + (INTERVAL '1 day' * ${TOKEN_TTL_DAYS}),
                  'shopify-migration-cron')
        `;
        token = rawToken;
      }

      if (c.is_approved) stats.created_approved++; else stats.created_pending++;

      if (dryRun) {
        stats.email_ok++;
        continue;
      }

      const link = `${PUBLIC_BASE}/recuperar/${token}`;
      const subject = c.is_approved
        ? "Tu cuenta migró · Define tu contraseña — Cultimed"
        : "Bienvenido a la nueva plataforma — Cultimed";
      const firstName = c.first_name || null;
      const html = buildEmailHtml({ firstName, link, isApproved: c.is_approved });
      const text = buildEmailText({ firstName, link, isApproved: c.is_approved });
      const send = await sendEmail(c.email, subject, html, text);
      if (send.ok) stats.email_ok++;
      else { stats.email_failed++; stats.errors.push(`${c.email}: ${send.error}`); }

      await new Promise((r) => setTimeout(r, 100));
    } catch (e: any) {
      stats.email_failed++;
      stats.errors.push(`${c.email}: ${e?.message || "unknown"}`);
    }
  }

  return stats;
}

export async function GET(req: NextRequest) {
  // Vercel cron envía Authorization: Bearer ${CRON_SECRET} automaticamente.
  // Manual trigger: pasa MIGRATION_SECRET en el header.
  const authHeader = req.headers.get("authorization") || "";
  const expectedCron = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
  const expectedManual = process.env.MIGRATION_SECRET ? `Bearer ${process.env.MIGRATION_SECRET}` : null;

  if (authHeader !== expectedCron && authHeader !== expectedManual) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!RESEND_API_KEY) {
    return NextResponse.json({ error: "RESEND_API_KEY missing" }, { status: 500 });
  }

  let customers: Customer[];
  try {
    customers = await fetchCustomers();
  } catch (e: any) {
    return NextResponse.json({ error: "fetch_customers_failed", detail: e?.message }, { status: 500 });
  }

  // Idempotency: chequea cuántos accounts ya existen vs total. Si ya migramos >80%, abort.
  const sqlClient = getSql();
  const existingCount = await sqlClient<{ count: number }[]>`
    SELECT COUNT(*)::int as count FROM customer_accounts WHERE email != 'rincondeoz@gmail.com'
  `;
  const total = customers.filter((c) => !SKIP_EMAILS.has(c.email)).length;
  const already = existingCount[0]?.count ?? 0;
  if (already >= Math.floor(total * 0.8)) {
    return NextResponse.json({
      skipped: "already_run",
      message: `${already} accounts already exist (≥80% of ${total}). Migration considered complete.`,
    });
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry_run") === "1";
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : Infinity;

  const t0 = Date.now();
  const stats = await runMigration({ limit, dryRun, customers });
  const elapsed_ms = Date.now() - t0;

  return NextResponse.json({ ok: true, dry_run: dryRun, elapsed_ms, ...stats });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
