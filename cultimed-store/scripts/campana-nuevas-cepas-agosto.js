// Campana: avisa a los pacientes con receta aprobada que hay cepas nuevas
// disponibles para dispensar (Gaslight, Banana Purple Punch, Zkittlez,
// Wedding Cheesecake, Lemon Pie).
//
// NO es una notificacion transaccional (no dispara sola desde la app) —  es un
// envio manual, a peticion de Oscar. Por eso vive fuera de notify.ts/
// notify-templates.ts (esos son solo para eventos 1-a-1 con dedupe natural)
// pero REUSA su misma infraestructura real: mismo layout visual, mismo token
// de baja (/baja?t=...) y el mismo notification_log para no duplicar envios
// si el script se corre dos veces.
//
// DOS MODOS:
//   node scripts/campana-nuevas-cepas-agosto.js --preview   -> arma el HTML de
//     UN destinatario de muestra y lo guarda en preview-campana.html, NO envia nada.
//   node scripts/campana-nuevas-cepas-agosto.js --enviar    -> manda de verdad
//     a los 90 pacientes elegibles (receta aprobada, marketing_opt_out=false).
// Sin flag: no hace nada (evita un envio accidental al correr sin pensar).
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
const SESSION_SECRET = get("SESSION_SECRET");

const CAMPAIGN_TYPE = "promo_nuevas_cepas_agosto_2026"; // dedupe: no reenvia si ya se le mando a ese paciente

const sql = postgres(url, { prepare: false, ssl: "require", max: 5 });

// --- token de baja, IGUAL a lib/notify-utils.ts (makeUnsubscribeToken) ---
function unsubToken(accountId) {
  const payload = String(accountId);
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(`unsub:${payload}`).digest("hex").slice(0, 32);
  return `${payload}.${sig}`;
}

// --- plantilla: MISMO layout() que notify-templates.ts (dark editorial),
// + imagen de cabecera y una franja de color propias de esta campana (las
// notificaciones transaccionales no llevan imagen; esta si, a pedido de Oscar).
const LOGO = "https://ibkhvopshhlbvjwrmuzm.supabase.co/storage/v1/object/public/email-assets/cultimed-logo-gold.png";
const HERO_IMAGE = "https://ibkhvopshhlbvjwrmuzm.supabase.co/storage/v1/object/public/email-assets/products/campana-nuevas-cepas-agosto-2026-hero.png";
function esc(s) { return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function layout({ eyebrow, eyebrowColor = "#8b7d5c", titleHtml, greeting, bodyHtml, ctaLabel, ctaUrl, footerExtraHtml = "", heroImage = null }) {
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0F1A22;font-family:Georgia,serif;color:#1a1a1a;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#0F1A22;">
  <tr><td align="center" style="padding:48px 16px;">
    <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background:#F7F1E5;border:1px solid #C9B891;">
      <tr><td style="height:6px;background:linear-gradient(90deg,#8b7d5c,#b0672e,#6b3a5c,#3d5c3a,#a68a3c);font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td align="center" style="padding:32px 48px 20px;">
        <img src="${LOGO}" alt="Cultimed" width="150" style="display:block;width:150px;max-width:55%;height:auto;border:0;" />
      </td></tr>
      ${heroImage ? `<tr><td style="padding:0 0 8px;"><img src="${heroImage}" alt="" width="600" style="display:block;width:100%;height:auto;border:0;" /></td></tr>` : ""}
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
        <p style="margin:0 0 8px;font-size:10px;"><strong style="color:#5d544a;">Cultimed</strong> · Operamos bajo Ley 20.850 y normativa SANNA. ¿Dudas? <a href="mailto:contacto@dispensariocultimed.cl" style="color:#5d544a;text-decoration:underline;">contacto@dispensariocultimed.cl</a></p>
        ${footerExtraHtml}
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

// Cepas de la campana (las 5 ya confirmadas dispensables, no se inventa nada
// mas). Cada una con un color propio para las pills — tonos de la paleta de
// la marca, sin salirse del registro editorial serio del dispensario.
const CEPAS = [
  { nombre: "Gaslight — Purple Ghost (Sativa dominante)", color: "#8b7d5c" },
  { nombre: "Banana Purple Punch Auto", color: "#b0672e" },
  { nombre: "Zkittlez", color: "#6b3a5c" },
  { nombre: "Wedding Cheesecake", color: "#3d5c3a" },
  { nombre: "Lemon Pie", color: "#a68a3c" },
];

function render(firstName, accountId) {
  const greeting = firstName ? `Hola ${esc(firstName)}` : "Hola";
  const unsubUrl = `${STORE_BASE}/baja?t=${unsubToken(accountId)}`;
  const pills = CEPAS.map((c) => `
        <tr><td style="padding:0 0 8px;">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c.color};margin-right:8px;"></span>
          <span style="font-family:'Helvetica Neue',Arial,sans-serif;font-size:14px;color:#1a1a1a;">${esc(c.nombre)}</span>
        </td></tr>`).join("");
  return {
    subject: "Nuevas cepas listas para dispensar · Cultimed",
    html: layout({
      eyebrow: "Catálogo actualizado",
      eyebrowColor: "#3d5c3a",
      heroImage: HERO_IMAGE,
      titleHtml: `Nuevas cepas <em style="font-style:italic;font-weight:400;">ya se dispensan</em>.`,
      greeting,
      bodyHtml: `<p style="margin:0 0 16px;">Ya están disponibles para dispensar en Cultimed:</p>
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 16px;">${pills}</table>
        <p style="margin:0 0 16px;">Puedes revisar la ficha técnica de cada una (genética, THC/CBD, perfil aromático) y coordinar tu dispensación directo desde el catálogo.</p>`,
      ctaLabel: "Ir a dispensación",
      ctaUrl: `${STORE_BASE}/productos`,
      footerExtraHtml: `<p style="margin:0;font-size:10px;">¿No quieres recibir avisos de catálogo? <a href="${unsubUrl}" style="color:#5d544a;text-decoration:underline;">Darte de baja</a>. Los avisos de tus pedidos y recetas seguirán llegando igual.</p>`,
    }),
    text: `${greeting},\n\nYa están disponibles para dispensar en Cultimed:\n${CEPAS.map(c => `- ${c.nombre}`).join("\n")}\n\nIr a dispensación: ${STORE_BASE}/productos\n\nCultimed · dispensariocultimed.cl\nDarte de baja de avisos de catálogo: ${unsubUrl}`,
  };
}

async function main() {
  const mode = process.argv[2];
  if (!["--preview", "--enviar"].includes(mode)) {
    console.log("Uso: node scripts/campana-nuevas-cepas-agosto.js --preview | --enviar");
    process.exit(1);
  }

  const recipients = await sql`
    SELECT id, email, full_name FROM customer_accounts
    WHERE prescription_status = 'aprobada' AND marketing_opt_out = false
    ORDER BY id`;
  console.log(`Destinatarios elegibles: ${recipients.length}`);

  if (mode === "--preview") {
    const sample = recipients[0];
    const { subject, html } = render(sample.full_name?.split(" ")[0], sample.id);
    const outPath = path.join(__dirname, "..", "preview-campana.html");
    fs.writeFileSync(outPath, html);
    console.log(`Preview (muestra: ${sample.email}) guardado en: ${outPath}`);
    console.log(`Asunto: ${subject}`);
    console.log("\nNADA fue enviado. Este es solo el modo de revision.");
    await sql.end();
    return;
  }

  // --enviar
  if (!RESEND_API_KEY) { console.error("Falta RESEND_API_KEY"); process.exit(1); }
  let enviados = 0, saltados = 0, fallidos = 0;
  for (const r of recipients) {
    const dedupeKey = `${CAMPAIGN_TYPE}:${r.id}`;
    const ins = await sql`
      INSERT INTO notification_log (customer_account_id, type, channel, recipient, dedupe_key, related_id, status)
      VALUES (${r.id}, ${CAMPAIGN_TYPE}, 'email', ${r.email}, ${dedupeKey}, ${r.id}, 'pending')
      ON CONFLICT (type, channel, dedupe_key) DO NOTHING
      RETURNING id`;
    if (!ins.length) { saltados++; continue; } // ya se le mando antes

    const logId = ins[0].id;
    const { subject, html, text } = render(r.full_name?.split(" ")[0], r.id);
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: EMAIL_FROM, to: [r.email], reply_to: EMAIL_REPLY_TO, subject, html, text }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        await sql`UPDATE notification_log SET status='failed', error=${`Resend: ${body?.message || res.status}`} WHERE id=${logId}`;
        fallidos++;
      } else {
        await sql`UPDATE notification_log SET status='sent' WHERE id=${logId}`;
        enviados++;
      }
    } catch (e) {
      await sql`UPDATE notification_log SET status='failed', error=${String(e.message)} WHERE id=${logId}`;
      fallidos++;
    }
  }
  console.log(`\nOK — enviados: ${enviados} | ya tenian envio previo (saltados): ${saltados} | fallidos: ${fallidos}`);
  await sql.end();
}

main().catch((e) => { console.error("FALLO:", e.message); process.exit(1); });
