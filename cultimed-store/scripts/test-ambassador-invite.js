// Test end-to-end del flow de invitar embajador.
// Replica la lógica del server action /ambassadors/invite — crea customer
// con is_ambassador=1, genera referral_code, dispara email apothecary.
require("node:fs").readFileSync(".env.local", "utf8").split(/\r?\n/).forEach((l) => {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
});
const postgres = require("postgres");
const crypto = require("node:crypto");

const STORE_BASE = process.env.NEXT_PUBLIC_BASE_URL || "https://dispensariocultimed.cl";
const HERO_IMAGE = "https://ibkhvopshhlbvjwrmuzm.supabase.co/storage/v1/object/public/email-assets/apothecary-hero.png";
const LOGO_IMAGE = "https://ibkhvopshhlbvjwrmuzm.supabase.co/storage/v1/object/public/email-assets/cultimed-logo-gold.png";
const TOKEN_TTL_DAYS = 14;

const TO_EMAIL = process.argv[2] || "rincondeoz+ambassadortest@gmail.com";
const FULL_NAME = process.argv[3] || "Test Embajador (rincondeoz alias)";
const MESSAGE = process.argv[4] || "Test del flow zero-friction. Si recibes este email, el sistema funciona.";

function generateReferralCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

(async () => {
  const sql = postgres(process.env.DATABASE_URL, { prepare: false, ssl: "require", max: 1 });

  console.log(`▶ Email destino:  ${TO_EMAIL}`);
  console.log(`▶ Nombre:         ${FULL_NAME}`);
  console.log(`▶ STORE_BASE:     ${STORE_BASE}`);
  console.log(`▶ RESEND_API_KEY: ${process.env.RESEND_API_KEY ? "✓ presente" : "✗ AUSENTE"}`);
  console.log("");

  // Upsert customer
  const existing = await sql`SELECT id, is_ambassador FROM customer_accounts WHERE email = ${TO_EMAIL}`;
  let accountId;
  if (existing.length > 0) {
    accountId = existing[0].id;
    if (existing[0].is_ambassador !== 1) {
      await sql`UPDATE customer_accounts SET is_ambassador=1, updated_at=CURRENT_TIMESTAMP WHERE id=${accountId}`;
    }
    console.log(`  ↻ Existing account id=${accountId} → marked as ambassador`);
  } else {
    const r = await sql`
      INSERT INTO customer_accounts (email, password_hash, full_name, prescription_status, is_ambassador, ambassador_invited_at)
      VALUES (${TO_EMAIL}, ${""}, ${FULL_NAME}, 'none', 1, CURRENT_TIMESTAMP)
      RETURNING id
    `;
    accountId = r[0].id;
    console.log(`  + Created account id=${accountId}`);
  }

  // Genera referral_code (si ya tiene, lo reusa)
  const existingCode = await sql`SELECT code FROM referral_codes WHERE ambassador_account_id = ${accountId}`;
  let code;
  if (existingCode.length > 0) {
    code = existingCode[0].code;
    console.log(`  ↻ Existing code: ${code}`);
  } else {
    code = generateReferralCode();
    await sql`INSERT INTO referral_codes (ambassador_account_id, code, is_active) VALUES (${accountId}, ${code}, 1)`;
    console.log(`  + Generated code: ${code}`);
  }

  // Token reset 14 días para dashboard
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  await sql`
    INSERT INTO password_reset_tokens (account_type, account_id, token_hash, expires_at, requested_ip)
    VALUES ('customer', ${accountId}, ${tokenHash}, CURRENT_TIMESTAMP + (INTERVAL '1 day' * ${TOKEN_TTL_DAYS}), 'test-script')
  `;

  const dashboardLink = `${STORE_BASE}/recuperar/${rawToken}`;
  const referralLink = `${STORE_BASE}/r/${code}`;
  const greeting = FULL_NAME.split(" ")[0];

  // Email HTML (mismo que action)
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
        ${MESSAGE ? `<p style="margin:0 0 24px;padding:14px 18px;background:#FBF5E8;border-left:3px solid #B89968;font-style:italic;font-size:14px;color:#5d544a;">"${MESSAGE}"</p>` : ""}
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0 28px;background:#0F1A22;border:1px solid #0F1A22;">
          <tr><td align="center" style="padding:32px 24px;">
            <p style="margin:0 0 12px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;letter-spacing:2.5px;text-transform:uppercase;color:#B89968;">— Tu código personal</p>
            <p style="margin:0 0 20px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:42px;font-weight:600;letter-spacing:6px;color:#F7F1E5;">${code}</p>
            <p style="margin:0 0 6px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#B89968;">Tu link único:</p>
            <p style="margin:0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#F7F1E5;word-break:break-all;">
              <a href="${referralLink}" style="color:#F7F1E5;text-decoration:underline;">${referralLink}</a>
            </p>
          </td></tr>
        </table>
        <p style="margin:0 0 12px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#8b7d5c;">— Cómo funciona</p>
        <ul style="margin:0 0 24px;padding-left:20px;font-size:14px;line-height:1.6;">
          <li style="margin-bottom:6px;">Comparte tu código <strong>${code}</strong> o tu link único.</li>
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
          Necesario solo si quieres ver estadísticas. Válido 14 días.
        </p>
      </td></tr>
      <tr><td style="padding:28px 48px 36px;border-top:1px solid #C9B891;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;line-height:1.7;color:#8b7d5c;">
        <p style="margin:0 0 12px;">¿Dudas? <a href="mailto:contacto@dispensariocultimed.cl" style="color:#5d544a;text-decoration:underline;">contacto@dispensariocultimed.cl</a></p>
        <p style="margin:0;font-size:10px;color:#9c8e6e;"><strong style="color:#5d544a;">Cultimed</strong> · <a href="https://dispensariocultimed.cl" style="color:#8b7d5c;text-decoration:none;">dispensariocultimed.cl</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  const text = `${greeting},

Cultimed te invita a ser embajador clínico. Tu código ya está activo.

${MESSAGE ? `"${MESSAGE}"\n\n` : ""}====================================
TU CÓDIGO: ${code}
TU LINK:   ${referralLink}
====================================

Cómo funciona:
- Comparte tu código o link
- Quien lo usa: 5% de descuento en su primera compra
- Tú: 10% de comisión en su primera compra + 5% residual (90 días)

Para ver tu dashboard de comisiones, define tu contraseña (válido 14 días):
${dashboardLink}

Cultimed · dispensariocultimed.cl`;

  // Send via Resend
  console.log("");
  console.log("▶ Enviando email via Resend...");
  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || "Cultimed <no-reply@dispensariocultimed.cl>",
      to: [TO_EMAIL],
      reply_to: process.env.EMAIL_REPLY_TO || "contacto@dispensariocultimed.cl",
      subject: "Te invitamos a ser embajador · Cultimed",
      html,
      text,
    }),
  });
  const body = await resendRes.json();
  if (!resendRes.ok) {
    console.error(`✗ Resend failed: ${resendRes.status}`, body);
    process.exit(1);
  }
  console.log(`✓ Email sent! Resend id: ${body.id}`);
  console.log("");
  console.log("============== RESUMEN ==============");
  console.log(`  account id:    ${accountId}`);
  console.log(`  email:         ${TO_EMAIL}`);
  console.log(`  is_ambassador: 1`);
  console.log(`  código:        ${code}`);
  console.log(`  referral link: ${referralLink}`);
  console.log(`  dashboard:     ${dashboardLink}`);
  console.log("=====================================");

  await sql.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
