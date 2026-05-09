// Cron diario: marca recetas vencidas (>6 meses desde aprobación) y envía
// recordatorio al paciente con CTA para subir nueva receta.
//
// Schedule en vercel.json. Idempotente: solo procesa recetas que aún no fueron
// marcadas como expired.
import { NextResponse, type NextRequest } from "next/server";
import { getSql } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const RX_VALIDITY_DAYS = 180; // 6 meses
const REMIND_BEFORE_DAYS = 30; // aviso 30 días antes
const STORE_BASE = process.env.NEXT_PUBLIC_BASE_URL || "https://dispensariocultimed.cl";
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || "Cultimed <no-reply@dispensariocultimed.cl>";
const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO || "contacto@dispensariocultimed.cl";

const LOGO = "https://ibkhvopshhlbvjwrmuzm.supabase.co/storage/v1/object/public/email-assets/cultimed-logo-gold.png";

function emailHtml(opts: { firstName: string; daysLeft: number | null; expired: boolean }) {
  const { firstName, daysLeft, expired } = opts;
  const greeting = firstName ? firstName.split(" ")[0] : "Hola";
  const titleHtml = expired
    ? `Tu receta <em style="font-style:italic;font-weight:400;">venció</em>.`
    : `Tu receta vence en <em style="font-style:italic;font-weight:400;">${daysLeft} días</em>.`;
  const bodyText = expired
    ? `Tu receta médica registrada en Cultimed cumplió 6 meses desde su validación y ya no es vigente bajo Ley 20.850. Para seguir comprando productos cannabicos, sube una nueva receta médica vigente.`
    : `Tu receta médica registrada en Cultimed cumple 6 meses pronto y dejará de ser vigente bajo Ley 20.850. Para no perder acceso al catálogo, sube una nueva receta antes que venza.`;

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0F1A22;font-family:Georgia,serif;color:#1a1a1a;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#0F1A22;">
  <tr><td align="center" style="padding:48px 16px;">
    <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background:#F7F1E5;border:1px solid #C9B891;">
      <tr><td align="center" style="padding:36px 48px 24px;">
        <img src="${LOGO}" alt="Cultimed" width="160" style="display:block;width:160px;max-width:60%;height:auto;border:0;" />
      </td></tr>
      <tr><td style="padding:24px 48px 16px;">
        <p style="margin:0 0 12px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:${expired ? "#9b3a3a" : "#8b7d5c"};">
          ${expired ? "Receta vencida" : "Receta por vencer"}
        </p>
        <h1 style="margin:0;font-family:Georgia,serif;font-size:32px;font-weight:300;line-height:1.1;color:#1a1a1a;">
          ${titleHtml}
        </h1>
      </td></tr>
      <tr><td style="padding:0 48px 32px;font-family:Georgia,serif;font-size:16px;line-height:1.65;color:#3a3530;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;"><tr><td style="height:1px;background:#C9B891;"></td></tr></table>
        <p style="margin:0 0 16px;">${greeting},</p>
        <p style="margin:0 0 24px;">${bodyText}</p>
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px auto 8px;">
          <tr><td align="center" style="background:#0F1A22;border:1px solid #0F1A22;">
            <a href="${STORE_BASE}/mi-cuenta/recetas" style="display:inline-block;padding:16px 40px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:#F7F1E5;text-decoration:none;">
              Subir nueva receta
            </a>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:24px 48px 32px;border-top:1px solid #C9B891;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;line-height:1.7;color:#8b7d5c;">
        <p style="margin:0;font-size:10px;"><strong style="color:#5d544a;">Cultimed</strong> · Operamos bajo Ley 20.850 y normativa SANNA. ¿Dudas? <a href="mailto:contacto@dispensariocultimed.cl" style="color:#5d544a;text-decoration:underline;">contacto@dispensariocultimed.cl</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

async function sendEmail(to: string, subject: string, html: string, text: string) {
  if (!RESEND_API_KEY) return { ok: false as const, error: "RESEND_API_KEY missing" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: EMAIL_FROM, to: [to], reply_to: EMAIL_REPLY_TO, subject, html, text }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false as const, error: body?.message || `HTTP ${res.status}` };
  return { ok: true as const, id: body.id };
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const expectedCron = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
  const expectedManual = process.env.MIGRATION_SECRET ? `Bearer ${process.env.MIGRATION_SECRET}` : null;
  if (auth !== expectedCron && auth !== expectedManual) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const sql = getSql();
  const stats = { expired_now: 0, reminded: 0, email_failed: 0, errors: [] as string[] };

  // 1. Marcar expired las recetas que cumplieron 180 días
  const toExpire = await sql<Array<{ id: number; email: string; full_name: string }>>`
    SELECT id, email, full_name FROM customer_accounts
    WHERE prescription_status = 'aprobada'
      AND prescription_reviewed_at IS NOT NULL
      AND prescription_reviewed_at < NOW() - INTERVAL '${sql.unsafe(String(RX_VALIDITY_DAYS))} days'
  `;
  for (const c of toExpire) {
    try {
      await sql`UPDATE customer_accounts SET prescription_status='expired', updated_at=NOW() WHERE id=${c.id}`;
      const html = emailHtml({ firstName: c.full_name || "", daysLeft: null, expired: true });
      const text = `${c.full_name || "Hola"},\n\nTu receta médica registrada en Cultimed venció (cumplió 6 meses desde validación). Sube una nueva receta vigente:\n\n${STORE_BASE}/mi-cuenta/recetas\n\nCultimed · dispensariocultimed.cl`;
      const r = await sendEmail(c.email, "Tu receta venció · Cultimed", html, text);
      if (r.ok) stats.expired_now++;
      else { stats.email_failed++; stats.errors.push(`${c.email}: ${r.error}`); }
    } catch (e: any) {
      stats.email_failed++;
      stats.errors.push(`${c.email}: ${e?.message}`);
    }
  }

  // 2. Recordatorio 30 días antes (entre días 150-160 desde aprobación)
  const toRemind = await sql<Array<{ id: number; email: string; full_name: string; days_left: number }>>`
    SELECT id, email, full_name,
      ${RX_VALIDITY_DAYS}::int - EXTRACT(DAY FROM NOW() - prescription_reviewed_at)::int as days_left
    FROM customer_accounts
    WHERE prescription_status = 'aprobada'
      AND prescription_reviewed_at IS NOT NULL
      AND prescription_reviewed_at BETWEEN NOW() - INTERVAL '${sql.unsafe(String(RX_VALIDITY_DAYS - REMIND_BEFORE_DAYS))} days'
                                       AND NOW() - INTERVAL '${sql.unsafe(String(RX_VALIDITY_DAYS - REMIND_BEFORE_DAYS - 1))} days'
  `;
  for (const c of toRemind) {
    try {
      const html = emailHtml({ firstName: c.full_name || "", daysLeft: c.days_left, expired: false });
      const text = `${c.full_name || "Hola"},\n\nTu receta médica registrada en Cultimed vence en ${c.days_left} días. Sube una nueva antes que venza:\n\n${STORE_BASE}/mi-cuenta/recetas\n\nCultimed · dispensariocultimed.cl`;
      const r = await sendEmail(c.email, `Tu receta vence en ${c.days_left} días · Cultimed`, html, text);
      if (r.ok) stats.reminded++;
      else { stats.email_failed++; stats.errors.push(`${c.email}: ${r.error}`); }
    } catch (e: any) {
      stats.email_failed++;
      stats.errors.push(`${c.email}: ${e?.message}`);
    }
  }

  return NextResponse.json({ ok: true, ...stats, errors: stats.errors.slice(0, 10) });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
