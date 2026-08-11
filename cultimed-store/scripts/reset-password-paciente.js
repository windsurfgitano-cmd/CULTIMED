// Dispara un reset de contraseña REAL para un paciente que no puede ingresar,
// replicando EXACTO el flujo publico de /recuperar (createCustomerResetToken +
// el mismo correo). No genera ni ve la contraseña del paciente en ningun
// momento -- solo crea el token de un solo uso (1h) y manda el link; el
// paciente elige su propia clave nueva al abrirlo.
//
// Uso: node scripts/reset-password-paciente.js <email>
const fs = require("fs");
const path = require("path");
const postgres = require("postgres");
const crypto = require("crypto");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim().replace(/^["']|["']$/g, "");
const url = get("DATABASE_URL");
const RESEND_API_KEY = get("RESEND_API_KEY");
const EMAIL_FROM = get("EMAIL_FROM") || "Cultimed <no-reply@dispensariocultimed.cl>";
const EMAIL_REPLY_TO = get("EMAIL_REPLY_TO") || "contacto@dispensariocultimed.cl";
const STORE_BASE = get("STORE_PUBLIC_BASE") || get("NEXT_PUBLIC_BASE_URL") || "https://dispensariocultimed.cl";

const sql = postgres(url, { prepare: false, ssl: "require", max: 1 });

// --- mismo layout que lib/email.ts emailLayout() ---
function emailLayout({ preheader, title, body, ctaLabel, ctaUrl, footerNote }) {
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#F2EEE6;font-family:Georgia,serif;color:#1a1a1a;">
${preheader ? `<div style="display:none;visibility:hidden;mso-hide:all;font-size:1px;color:#F2EEE6;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</div>` : ""}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F2EEE6;">
  <tr><td align="center" style="padding:48px 24px;">
    <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background:#FAF6EE;border:1px solid #DCD3C4;">
      <tr><td style="padding:40px 48px 24px;">
        <p style="margin:0 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#7a7066;">Cultimed · Dispensario</p>
        <h1 style="margin:16px 0 0;font-size:32px;font-weight:300;line-height:1.1;color:#1a1a1a;">${title}</h1>
      </td></tr>
      <tr><td style="padding:0 48px 32px;font-size:16px;line-height:1.6;color:#3a3530;">
        ${body}
        ${ctaLabel && ctaUrl ? `
        <div style="margin:32px 0 8px;">
          <a href="${ctaUrl}" style="display:inline-block;background:#1a1a1a;color:#F2EEE6;padding:14px 32px;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:13px;letter-spacing:1px;text-transform:uppercase;">${ctaLabel}</a>
        </div>
        <p style="margin:8px 0 0;font-size:12px;color:#7a7066;font-family:monospace;word-break:break-all;">O copia este enlace: ${ctaUrl}</p>` : ""}
      </td></tr>
      <tr><td style="padding:24px 48px 40px;border-top:1px solid #DCD3C4;font-size:11px;line-height:1.6;color:#7a7066;font-family:Helvetica,Arial,sans-serif;">
        ${footerNote || "Si no esperabas este mensaje, ignóralo. Tu cuenta sigue segura."}
        <br><br>
        Cultimed · dispensariocultimed.cl<br>
        Datos clínicos protegidos bajo Ley 19.628.
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

(async () => {
  const email = String(process.argv[2] || "").trim().toLowerCase();
  if (!email) { console.error("Uso: node scripts/reset-password-paciente.js <email>"); process.exit(1); }

  try {
    const acc = await sql`SELECT id, email, full_name FROM customer_accounts WHERE email = ${email}`;
    if (!acc.length) { console.error(`No existe cuenta con email ${email}`); process.exit(1); }
    console.log(`Cuenta encontrada: ${acc[0].full_name} (id=${acc[0].id})`);

    // Anti-abuso: invalida tokens previos sin usar, igual que el flujo real.
    await sql`
      UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP
      WHERE account_type = 'customer' AND account_id = ${acc[0].id} AND used_at IS NULL`;

    const token = crypto.randomBytes(32).toString("base64url");
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    await sql`
      INSERT INTO password_reset_tokens (account_type, account_id, token_hash, expires_at, requested_ip)
      VALUES ('customer', ${acc[0].id}, ${hash}, CURRENT_TIMESTAMP + INTERVAL '1 hour', 'script-soporte-oscar')`;

    const link = `${STORE_BASE}/recuperar/${token}`;
    console.log(`Token creado, valido 1 hora, un solo uso.`);

    if (!RESEND_API_KEY) {
      console.log("RESEND_API_KEY no configurado -- link (mandalo tu):", link);
      process.exit(0);
    }

    const html = emailLayout({
      preheader: "Restablece tu contraseña en Cultimed",
      title: "Restablece tu contraseña.",
      body: `
<p>Hola,</p>
<p>Recibimos una solicitud para restablecer la contraseña de tu cuenta Cultimed (${acc[0].email}).</p>
<p>El enlace es válido por 1 hora y solo se puede usar una vez.</p>
      `,
      ctaLabel: "Restablecer contraseña",
      ctaUrl: link,
      footerNote: "Si tú no solicitaste este cambio, puedes ignorar este mensaje. Tu contraseña actual sigue activa.",
    });
    const text = `Restablece tu contraseña Cultimed.\n\nAbre este enlace en 1 hora:\n${link}\n\nSi no fuiste tú, ignora este mensaje.`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: EMAIL_FROM, to: [acc[0].email], reply_to: EMAIL_REPLY_TO, subject: "Recupera tu contraseña · Cultimed", html, text }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { console.error("FALLO envio Resend:", body?.message || res.status); process.exit(1); }
    console.log(`OK — correo de recuperación enviado a ${acc[0].email} (Resend id: ${body?.id || "?"})`);
  } catch (e) {
    console.error("FALLO:", e.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
})();
