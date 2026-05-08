// Invitar embajador: admin crea placeholder customer_account con is_ambassador=1
// y dispara email con link de password reset. La persona se registra, sube su
// receta médica, y cuando el QF la aprueba, automáticamente queda habilitada
// como embajadora en su /mi-cuenta del store.

import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff, isAdminOrAbove } from "@/lib/auth";
import { get, run } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import PageHeader from "@/components/PageHeader";
import crypto from "node:crypto";

// Inline copy de generateReferralCode — sin import cross-project
function generateReferralCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O/1/I para legibilidad
  let code = "";
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

async function ensureReferralCode(accountId: number): Promise<string> {
  const existing = await get<{ code: string }>(
    `SELECT code FROM referral_codes WHERE ambassador_account_id = ?`,
    accountId
  );
  if (existing) return existing.code;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode();
    const collision = await get<{ id: number }>(`SELECT id FROM referral_codes WHERE code = ?`, code);
    if (collision) continue;
    await run(
      `INSERT INTO referral_codes (ambassador_account_id, code, is_active) VALUES (?, ?, 1)`,
      accountId, code
    );
    return code;
  }
  throw new Error("could not generate unique code");
}

export const dynamic = "force-dynamic";

const TOKEN_TTL_DAYS = 14;
const STORE_BASE = process.env.NEXT_PUBLIC_STORE_BASE_URL || "https://dispensariocultimed.cl";
const HERO_IMAGE = "https://ibkhvopshhlbvjwrmuzm.supabase.co/storage/v1/object/public/email-assets/apothecary-hero.png";
const LOGO_IMAGE = "https://ibkhvopshhlbvjwrmuzm.supabase.co/storage/v1/object/public/email-assets/cultimed-logo-gold.png";

async function inviteAmbassadorAction(formData: FormData) {
  "use server";
  const staff = await requireStaff();
  if (!isAdminOrAbove(staff)) redirect("/ambassadors/invite?e=forbidden");

  const email = String(formData.get("email") || "").trim().toLowerCase();
  const fullName = String(formData.get("full_name") || "").trim();
  const message = String(formData.get("message") || "").trim();

  if (!email || !email.includes("@")) redirect("/ambassadors/invite?e=bad_email");
  if (!fullName) redirect("/ambassadors/invite?e=bad_name");

  // Upsert: si ya existe, marca como ambassador. Si no, crea placeholder.
  const existing = await get<{ id: number; is_ambassador: number }>(
    `SELECT id, is_ambassador FROM customer_accounts WHERE email = ?`,
    email
  );

  let accountId: number;
  let isNew = false;

  if (existing) {
    if (existing.is_ambassador !== 1) {
      await run(
        `UPDATE customer_accounts
         SET is_ambassador = 1, ambassador_invited_by = ?, ambassador_invited_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        staff.id, existing.id
      );
    }
    accountId = existing.id;
  } else {
    const created = await run(
      `INSERT INTO customer_accounts
         (email, password_hash, full_name, prescription_status, is_ambassador, ambassador_invited_by, ambassador_invited_at)
       VALUES (?, ?, ?, 'none', 1, ?, CURRENT_TIMESTAMP)`,
      email, "", fullName, staff.id
    );
    accountId = (created as any).lastInsertRowid;
    isNew = true;
  }

  // Genera código de referido INMEDIATAMENTE (sin esperar a receta)
  const referralCode = await ensureReferralCode(accountId);

  // Token opcional para que defina contraseña y vea su dashboard (14 días)
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  await run(
    `INSERT INTO password_reset_tokens (account_type, account_id, token_hash, expires_at, requested_ip)
     VALUES ('customer', ?, ?, CURRENT_TIMESTAMP + (INTERVAL '1 day' * ?), 'ambassador-invite')`,
    accountId, tokenHash, TOKEN_TTL_DAYS
  );

  const dashboardLink = `${STORE_BASE}/recuperar/${rawToken}`;
  const referralLink = `${STORE_BASE}/r/${referralCode}`;
  const greeting = fullName.split(" ")[0];

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0F1A22;font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#0F1A22;">
  <tr><td align="center" style="padding:48px 16px;">
    <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background:#F7F1E5;border:1px solid #C9B891;">
      <tr><td align="center" style="padding:36px 48px 24px;">
        <img src="${LOGO_IMAGE}" alt="Cultimed" width="160" style="display:block;width:160px;max-width:60%;height:auto;border:0;" />
      </td></tr>
      <tr><td style="padding:0;line-height:0;">
        <img src="${HERO_IMAGE}" alt="Cultimed" width="600" style="display:block;width:100%;height:auto;border:0;" />
      </td></tr>
      <tr><td style="padding:36px 48px 24px;">
        <p style="margin:0 0 12px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:#8b7d5c;">
          Cultimed · Programa de embajadores
        </p>
        <h1 style="margin:0 0 6px;font-family:Georgia,serif;font-size:36px;font-weight:300;line-height:1.05;color:#1a1a1a;">
          Te <em style="font-style:italic;font-weight:400;">invitamos</em>.
        </h1>
        <p style="margin:0;font-family:Georgia,serif;font-size:18px;font-style:italic;color:#5d544a;line-height:1.4;">
          Sé embajador clínico de Cultimed.
        </p>
      </td></tr>
      <tr><td style="padding:0 48px 32px;font-family:Georgia,serif;font-size:16px;line-height:1.65;color:#3a3530;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:28px;">
          <tr><td style="height:1px;background:#C9B891;"></td></tr>
        </table>
        <p style="margin:0 0 16px;">${greeting},</p>
        <p style="margin:0 0 16px;">Cultimed te invita a ser <strong>embajador clínico</strong>. Ya tienes tu código personal activado, comparte tu link y comienza a generar comisiones desde hoy.</p>
        ${message ? `<p style="margin:0 0 24px;padding:14px 18px;background:#FBF5E8;border-left:3px solid #B89968;font-style:italic;font-size:14px;color:#5d544a;">"${message}"</p>` : ""}

        <!-- Código y link prominentes -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0 28px;background:#0F1A22;border:1px solid #0F1A22;">
          <tr><td align="center" style="padding:32px 24px;">
            <p style="margin:0 0 12px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;letter-spacing:2.5px;text-transform:uppercase;color:#B89968;">— Tu código personal</p>
            <p style="margin:0 0 20px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:42px;font-weight:600;letter-spacing:6px;color:#F7F1E5;">${referralCode}</p>
            <p style="margin:0 0 6px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#B89968;">Tu link único:</p>
            <p style="margin:0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#F7F1E5;word-break:break-all;">
              <a href="${referralLink}" style="color:#F7F1E5;text-decoration:underline;">${referralLink}</a>
            </p>
          </td></tr>
        </table>

        <p style="margin:0 0 12px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#8b7d5c;">— Cómo funciona</p>
        <ul style="margin:0 0 24px;padding-left:20px;font-size:14px;line-height:1.6;">
          <li style="margin-bottom:6px;">Comparte tu código <strong>${referralCode}</strong> o tu link único.</li>
          <li style="margin-bottom:6px;">Quien lo use recibe <strong>5% de descuento</strong> en su primera compra.</li>
          <li style="margin-bottom:6px;">Tú recibes <strong>10% de comisión</strong> en su primera compra y <strong>5% residual</strong> en compras posteriores (90 días).</li>
          <li style="margin-bottom:0;">Pagos por transferencia bancaria mensual.</li>
        </ul>

        <p style="margin:24px 0 16px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#8b7d5c;">— Para ver tu dashboard de comisiones</p>
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto 8px;">
          <tr><td align="center" style="background:#F7F1E5;border:1px solid #0F1A22;">
            <a href="${dashboardLink}" style="display:inline-block;padding:14px 32px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:#0F1A22;text-decoration:none;">
              Define tu contraseña
            </a>
          </td></tr>
        </table>
        <p style="margin:8px 0 0;text-align:center;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;color:#8b7d5c;">
          Necesario solo si quieres ver estadísticas y configurar tu cuenta bancaria. Válido 14 días.
        </p>
      </td></tr>
      <tr><td style="padding:28px 48px 36px;border-top:1px solid #C9B891;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;line-height:1.7;color:#8b7d5c;">
        <p style="margin:0 0 12px;">¿Dudas? Escríbenos a <a href="mailto:contacto@dispensariocultimed.cl" style="color:#5d544a;text-decoration:underline;">contacto@dispensariocultimed.cl</a></p>
        <p style="margin:0;font-size:10px;color:#9c8e6e;"><strong style="color:#5d544a;">Cultimed</strong> · Asociación de Usuarios de Plantas Medicinales · <a href="https://dispensariocultimed.cl" style="color:#8b7d5c;text-decoration:none;">dispensariocultimed.cl</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  const text = `${greeting},

Cultimed te invita a ser embajador clínico. Tu código ya está activo.

${message ? `"${message}"\n\n` : ""}====================================
TU CÓDIGO: ${referralCode}
TU LINK:   ${referralLink}
====================================

Cómo funciona:
- Comparte tu código o link
- Quien lo usa: 5% de descuento en su primera compra
- Tú: 10% de comisión en su primera compra + 5% residual (90 días)
- Pagos por transferencia mensual

Para ver tu dashboard de comisiones, define tu contraseña (válido 14 días):
${dashboardLink}

¿Dudas? contacto@dispensariocultimed.cl

Cultimed · dispensariocultimed.cl`;

  const sendRes = await sendEmail({
    to: email,
    subject: "Te invitamos a ser embajador · Cultimed",
    html,
    text,
  });

  await logAudit({
    staffId: staff.id,
    action: "ambassador_invited",
    entityType: "customer_account",
    entityId: accountId,
    details: { email, full_name: fullName, is_new: isNew, email_sent: sendRes.ok },
  });

  redirect(`/ambassadors/invite?ok=1&email=${encodeURIComponent(email)}`);
}

export default async function InviteAmbassadorPage({
  searchParams,
}: {
  searchParams: { ok?: string; e?: string; email?: string };
}) {
  const staff = await requireStaff();
  if (!isAdminOrAbove(staff)) {
    return (
      <div className="p-8 border-l-2 border-sangria bg-sangria/5">
        <p className="text-sm text-ink">Solo administradores pueden invitar embajadores.</p>
      </div>
    );
  }

  const errMessages: Record<string, string> = {
    bad_email: "Email inválido.",
    bad_name: "Falta el nombre del invitado.",
    forbidden: "No tienes permisos para invitar embajadores.",
  };

  return (
    <>
      <PageHeader
        numeral="09"
        eyebrow="Programa de embajadores"
        title="Invitar embajador"
        subtitle="Genera código + link único al instante y dispara email con todo listo para compartir. No requiere cuenta ni receta del embajador."
        actions={
          <Link href="/ambassadors" className="font-mono text-[11px] uppercase tracking-widest text-ink hover:text-brass">
            ← Volver a embajadores
          </Link>
        }
      />

      {searchParams.ok === "1" && (
        <div className="mb-6 p-4 border-l-2 border-forest bg-forest/5">
          <p className="text-sm text-ink">
            ✓ Invitación enviada a <strong>{searchParams.email}</strong>. Recibirá email con el link
            para definir contraseña y activar su cuenta.
          </p>
        </div>
      )}
      {searchParams.e && errMessages[searchParams.e] && (
        <div className="mb-6 p-4 border-l-2 border-sangria bg-sangria/5">
          <p className="text-sm text-ink">{errMessages[searchParams.e]}</p>
        </div>
      )}

      <div className="grid grid-cols-12 gap-x-6 gap-y-12 items-start">
        <div className="col-span-12 lg:col-span-7">
          <form action={inviteAmbassadorAction} className="space-y-6">
            <div>
              <label htmlFor="email" className="eyebrow block mb-2">— Email del embajador</label>
              <input
                id="email"
                name="email"
                type="email"
                required
                placeholder="paciente@ejemplo.com"
                className="w-full px-4 py-3 bg-paper-bright border border-rule font-mono text-sm focus:border-ink focus:outline-none"
              />
              <p className="mt-2 text-[11px] text-ink-muted">
                No necesita estar registrado en el dispensario. El email puede ser cualquiera; el código se genera y se envía al instante.
              </p>
            </div>

            <div>
              <label htmlFor="full_name" className="eyebrow block mb-2">— Nombre completo</label>
              <input
                id="full_name"
                name="full_name"
                type="text"
                required
                placeholder="María González"
                className="w-full px-4 py-3 bg-paper-bright border border-rule text-sm focus:border-ink focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="message" className="eyebrow block mb-2">— Mensaje personalizado (opcional)</label>
              <textarea
                id="message"
                name="message"
                rows={3}
                placeholder="Aparece como cita en el email."
                className="w-full px-4 py-3 bg-paper-bright border border-rule text-sm focus:border-ink focus:outline-none"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                className="px-6 py-3 bg-ink text-paper font-mono text-[11px] uppercase tracking-[3px] hover:bg-brass transition-colors"
              >
                Enviar invitación →
              </button>
              <Link
                href="/ambassadors"
                className="px-6 py-3 border border-rule font-mono text-[11px] uppercase tracking-[3px] text-ink-muted hover:border-ink hover:text-ink transition-colors"
              >
                Cancelar
              </Link>
            </div>
          </form>
        </div>

        <aside className="col-span-12 lg:col-span-4 lg:col-start-9 bg-paper-dim/50 border border-rule p-6">
          <p className="eyebrow mb-3">— Cómo funciona</p>
          <ol className="space-y-3 text-sm text-ink-muted leading-relaxed">
            <li className="flex gap-3">
              <span className="font-mono text-[11px] tracking-widest text-brass-dim shrink-0 pt-0.5">01</span>
              <span>El sistema genera código único (ej. <code className="font-mono text-[12px]">XK4P2M</code>) y link <code className="font-mono text-[11px]">/r/XK4P2M</code>.</span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-[11px] tracking-widest text-brass-dim shrink-0 pt-0.5">02</span>
              <span>Email apothecary con código y link prominentes — listo para reenviar a contactos sin más pasos.</span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-[11px] tracking-widest text-brass-dim shrink-0 pt-0.5">03</span>
              <span>Cuando alguien usa el código en una compra: 5% off para el comprador, 10% comisión para el embajador.</span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-[11px] tracking-widest text-brass-dim shrink-0 pt-0.5">04</span>
              <span>El embajador puede definir contraseña (link en email) para ver su dashboard de comisiones y configurar transferencia bancaria.</span>
            </li>
          </ol>
          <div className="mt-6 pt-4 border-t border-rule">
            <p className="text-[11px] font-mono uppercase tracking-widest text-ink-muted">
              Sin fricción · Sin receta · Sin registro previo
            </p>
            <p className="mt-2 text-[11px] text-ink-muted leading-relaxed">
              El embajador no necesita ser paciente. Tu invitación basta para activar su código y empezar a generar comisiones.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
