// Correccion administrativa: la receta de Francisco Fuentes (customer_accounts.id=22,
// franciscofuentes389@gmail.com) fue rechazada por error el 2026-07-31. Oscar pidio
// revertirlo a aprobada.
//
// Replica EXACTAMENTE el flujo real de aprobacion (reviewAction en
// app/(app)/web-prescriptions/[id]/page.tsx) en vez de un UPDATE suelto:
//   1. UPDATE customer_accounts (mismo SET que el server action)
//   2. markPrescriptionApproved (lib/referrals.ts) — no-op aqui, no fue referido
//   3. logAudit (lib/audit.ts) — deja registro de que fue una correccion via script
//   4. sendNotification tipo 'receta_aprobada' — MISMA plantilla de email
//      (notify-templates.ts) y mismo dedupe por (type, channel, dedupe_key) que
//      el flujo real, para que Francisco reciba el aviso correcto: ya se le habia
//      mandado el correo de "rechazada" hace minutos.
//
// Correr desde cultisoft/:  node scripts/corregir-receta-francisco-fuentes.js
const fs = require("fs");
const path = require("path");
const postgres = require("postgres");

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim().replace(/^["']|["']$/g, "");
const url = get("DATABASE_URL");
const RESEND_API_KEY = get("RESEND_API_KEY");
const EMAIL_FROM = get("EMAIL_FROM") || "Cultimed <no-reply@dispensariocultimed.cl>";
const EMAIL_REPLY_TO = get("EMAIL_REPLY_TO") || "contacto@dispensariocultimed.cl";
const STORE_BASE = get("STORE_PUBLIC_BASE") || get("NEXT_PUBLIC_BASE_URL") || "https://dispensariocultimed.cl";

const ACCOUNT_ID = 22;
const STAFF_ID = 5; // rincondeoz@gmail.com, superadmin
const NOTES = "Correccion administrativa: la receta habia sido rechazada por error. Documentacion valida, aprobada.";

const sql = postgres(url, {
  prepare: false, ssl: "require", max: 1,
  types: {
    timestamptz: { to: 1184, from: [1184], serialize: (x) => x, parse: (x) => x },
    timestamp:   { to: 1114, from: [1114], serialize: (x) => x, parse: (x) => x },
  },
});

// --- Plantilla EXACTA de notify-templates.ts para 'receta_aprobada' (layout + case) ---
const LOGO = "https://ibkhvopshhlbvjwrmuzm.supabase.co/storage/v1/object/public/email-assets/cultimed-logo-gold.png";
function esc(s) { return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function layout({ eyebrow, eyebrowColor = "#8b7d5c", titleHtml, greeting, bodyHtml, ctaLabel, ctaUrl }) {
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
        <p style="margin:0 0 12px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:${eyebrowColor};">${eyebrow}</p>
        <h1 style="margin:0;font-family:Georgia,serif;font-size:32px;font-weight:300;line-height:1.1;color:#1a1a1a;">${titleHtml}</h1>
      </td></tr>
      <tr><td style="padding:0 48px 32px;font-family:Georgia,serif;font-size:16px;line-height:1.65;color:#3a3530;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;"><tr><td style="height:1px;background:#C9B891;"></td></tr></table>
        <p style="margin:0 0 16px;">${greeting},</p>
        ${bodyHtml}
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px auto 8px;">
          <tr><td align="center" style="background:#0F1A22;border:1px solid #0F1A22;">
            <a href="${ctaUrl}" style="display:inline-block;padding:16px 40px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:#F7F1E5;text-decoration:none;">${ctaLabel}</a>
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
function renderRecetaAprobada(firstName, notes) {
  const greeting = firstName ? `Hola ${esc(firstName)}` : "Hola";
  return {
    subject: "Tu receta fue aprobada · Cultimed",
    html: layout({
      eyebrow: "Receta aprobada",
      eyebrowColor: "#3d5c3a",
      titleHtml: `Tu receta fue <em style="font-style:italic;font-weight:400;">aprobada</em>.`,
      greeting,
      bodyHtml: `<p style="margin:0 0 16px;">Nuestro químico farmacéutico validó tu documentación. El catálogo completo ya está habilitado para ti — precios, disponibilidad por lote y compra.</p>${notes ? `<p style="margin:0 0 16px;">Nota del revisor: <em>${esc(notes)}</em></p>` : ""}`,
      ctaLabel: "Ver catálogo",
      ctaUrl: `${STORE_BASE}/productos`,
    }),
    text: `${greeting},\n\nTu receta fue aprobada por nuestro químico farmacéutico. Ya puedes comprar en el catálogo completo:\n${STORE_BASE}/productos${notes ? `\n\nNota del revisor: ${notes}` : ""}\n\nCultimed · dispensariocultimed.cl`,
  };
}
// --- fin plantilla ---

(async () => {
  try {
    const before = await sql`
      SELECT id, email, full_name, prescription_status FROM customer_accounts WHERE id = ${ACCOUNT_ID}`;
    if (!before.length) throw new Error(`No existe la cuenta id=${ACCOUNT_ID}`);
    if (before[0].email !== "franciscofuentes389@gmail.com") {
      throw new Error(`Verificacion de seguridad: el email no coincide (${before[0].email})`);
    }
    console.log("ANTES:", JSON.stringify(before[0]));

    const result = await sql.begin(async (tx) => {
      const upd = await tx`
        UPDATE customer_accounts
        SET prescription_status = 'aprobada',
            prescription_reviewed_by = ${STAFF_ID},
            prescription_reviewed_at = CURRENT_TIMESTAMP,
            prescription_reviewer_notes = ${NOTES},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${ACCOUNT_ID}
        RETURNING id, email, full_name, phone, prescription_status, prescription_uploaded_at::text AS uploaded_at_text`;

      // markPrescriptionApproved (lib/referrals.ts) — no-op si no fue referido.
      await tx`
        UPDATE referral_conversions
        SET prescription_approved_at = CURRENT_TIMESTAMP,
            status = CASE WHEN status = 'pending' THEN 'active' ELSE status END
        WHERE referred_account_id = ${ACCOUNT_ID} AND status IN ('pending', 'active')`;

      // logAudit (lib/audit.ts)
      await tx`
        INSERT INTO audit_logs (staff_id, action, entity_type, entity_id, details)
        VALUES (${STAFF_ID}, 'web_prescription_aprobada', 'customer_account', ${ACCOUNT_ID},
          ${JSON.stringify({
            notes: NOTES,
            correccion: true,
            motivo: "Rechazo anterior fue un error del revisor; revertido a peticion directa del operador (fuera del flujo normal del panel, via script)",
          })})`;

      return upd[0];
    });
    console.log("DESPUES:", JSON.stringify(result));

    // sendNotification('receta_aprobada') — mismo dedupe (type, channel, dedupe_key)
    // que el flujo real: type distinto al de 'receta_rechazada' ya enviado, asi que
    // NO choca con ese envio previo y SI manda el correo corregido.
    const dedupeKey = `${ACCOUNT_ID}:${result.uploaded_at_text}`;
    const ins = await sql`
      INSERT INTO notification_log (customer_account_id, type, channel, recipient, dedupe_key, related_id, status)
      VALUES (${ACCOUNT_ID}, 'receta_aprobada', 'email', ${result.email}, ${dedupeKey}, ${ACCOUNT_ID}, 'pending')
      ON CONFLICT (type, channel, dedupe_key) DO NOTHING
      RETURNING id`;
    if (!ins.length) {
      console.log("\nAVISO: ya existia un envio 'receta_aprobada' para este dedupeKey — no se reenvio (dedupe correcto).");
    } else {
      const logId = ins[0].id;
      if (!RESEND_API_KEY) {
        await sql`UPDATE notification_log SET status='skipped_not_configured', error='RESEND_API_KEY sin setear' WHERE id=${logId}`;
        console.log("\nAVISO: RESEND_API_KEY no configurado en este entorno — correo NO enviado, quedo 'skipped_not_configured'.");
      } else {
        const { subject, html, text } = renderRecetaAprobada(result.full_name?.split(" ")[0], null);
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: EMAIL_FROM, to: [result.email], reply_to: EMAIL_REPLY_TO, subject, html, text }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          await sql`UPDATE notification_log SET status='failed', error=${`Resend: ${body?.message || `HTTP ${res.status}`}`} WHERE id=${logId}`;
          console.log("\nFALLO envio de correo:", body?.message || res.status);
        } else {
          await sql`UPDATE notification_log SET status='sent' WHERE id=${logId}`;
          console.log(`\nOK — correo 'Tu receta fue aprobada' enviado a ${result.email} (Resend id: ${body?.id || "?"})`);
        }
      }
    }
  } catch (e) {
    console.error("FALLO:", e.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
})();
