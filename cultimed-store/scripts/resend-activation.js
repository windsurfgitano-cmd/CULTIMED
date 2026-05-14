// Re-envío del email de activación a clientes que aún no han seteado password
// (no abrieron el email original). Genera nuevo token (14 días) y manda email
// con copy de "recordatorio" en vez de migración inicial.
//
// Uso: node scripts/resend-activation.js [--dry-run] [--limit N] [--only-email X]
//
// Auto-load .env.local del proyecto.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

try {
  const envPath = path.resolve(__dirname, "..", ".env.local");
  fs.readFileSync(envPath, "utf8").split(/\r?\n/).forEach((line) => {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  });
} catch (_e) { /* sin .env.local — usa env del shell */ }

const postgres = require("postgres");

const DATABASE_URL = process.env.DATABASE_URL;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const PUBLIC_BASE = process.env.NEXT_PUBLIC_BASE_URL || "https://dispensariocultimed.cl";
const EMAIL_FROM = process.env.EMAIL_FROM || "Cultimed <no-reply@dispensariocultimed.cl>";
const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO || "contacto@dispensariocultimed.cl";
const HERO_IMAGE = "https://ibkhvopshhlbvjwrmuzm.supabase.co/storage/v1/object/public/email-assets/apothecary-hero.png";
const LOGO_IMAGE = "https://ibkhvopshhlbvjwrmuzm.supabase.co/storage/v1/object/public/email-assets/cultimed-logo-gold.png";
const TOKEN_TTL_DAYS = 14;
const SKIP_EMAILS = new Set(["contacto@dispensariocultimed.cl", "rincondeoz@gmail.com"]);

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;
const onlyIdx = args.indexOf("--only-email");
const ONLY_EMAIL = onlyIdx >= 0 ? args[onlyIdx + 1].toLowerCase() : null;

if (!DRY_RUN && !RESEND_API_KEY) {
  console.error("✗ RESEND_API_KEY no definido (requerido para envío real). Usa --dry-run para preview.");
  process.exit(1);
}

if (!DATABASE_URL) {
  console.error("✗ DATABASE_URL no definido");
  process.exit(1);
}

function buildEmailHtml(opts) {
  const { firstName, link, isApproved } = opts;
  const greeting = firstName ? firstName.split(" ")[0] : "Hola";

  const bodyApproved = `
    <p style="margin:0 0 16px;">${greeting},</p>
    <p style="margin:0 0 16px;">Hace unos días te enviamos un link para activar tu cuenta en la <strong>nueva plataforma Cultimed</strong>. Notamos que aún no la has activado, así que te lo reenviamos por si se traspapeló.</p>
    <p style="margin:0 0 16px;">Tu cuenta y receta médica anterior ya están migradas — solo falta que definas una contraseña para empezar a usarla.</p>
    <p style="margin:0;color:#7a7066;font-size:14px;font-style:italic;">Este link es válido por 14 días. Si pierdes acceso, escríbenos.</p>
  `;

  const bodyPending = `
    <p style="margin:0 0 16px;">${greeting},</p>
    <p style="margin:0 0 16px;">Hace unos días te enviamos un link para activar tu cuenta en la <strong>nueva plataforma Cultimed</strong>. Notamos que aún no la has activado, así que te lo reenviamos por si se traspapeló.</p>
    <p style="margin:0 0 16px;">Recuerda: necesitas <strong>definir tu contraseña</strong> y luego <strong>cargar una receta médica vigente</strong> para que nuestro químico farmacéutico la valide. Es rápido, toma 2 minutos.</p>
    <p style="margin:0;color:#7a7066;font-size:14px;font-style:italic;">Este link es válido por 14 días.</p>
  `;

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Recordatorio · Activa tu cuenta Cultimed</title></head>
<body style="margin:0;padding:0;background:#0F1A22;font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;-webkit-font-smoothing:antialiased;">
<div style="display:none;visibility:hidden;mso-hide:all;font-size:1px;color:#0F1A22;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
  Tu cuenta Cultimed te espera. Activa con un click — 14 días para hacerlo.
</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#0F1A22;">
  <tr><td align="center" style="padding:48px 16px;">
    <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background:#F7F1E5;border:1px solid #C9B891;">
      <tr><td align="center" style="padding:36px 48px 24px;background:#F7F1E5;">
        <img src="${LOGO_IMAGE}" alt="Cultimed · Cultivando Salud" width="160" style="display:block;width:160px;max-width:60%;height:auto;border:0;margin:0 auto;" />
      </td></tr>
      <tr><td style="padding:0;line-height:0;">
        <img src="${HERO_IMAGE}" alt="Cultimed · Dispensario clínico" width="600" style="display:block;width:100%;height:auto;border:0;" />
      </td></tr>
      <tr><td style="padding:36px 48px 24px;background:#F7F1E5;">
        <p style="margin:0 0 12px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:#8b7d5c;">
          Cultimed · Recordatorio
        </p>
        <h1 style="margin:0 0 6px;font-family:Georgia,serif;font-size:36px;font-weight:300;line-height:1.05;color:#1a1a1a;letter-spacing:-0.5px;">
          Tu <em style="font-style:italic;font-weight:400;color:#1a1a1a;">cuenta</em> te espera.
        </h1>
        <p style="margin:0;font-family:Georgia,serif;font-size:18px;font-style:italic;color:#5d544a;line-height:1.4;">
          ${isApproved ? "Tu receta sigue activa. Solo falta una contraseña." : "Activa tu cuenta y carga tu receta vigente."}
        </p>
      </td></tr>
      <tr><td style="padding:0 48px 32px;background:#F7F1E5;font-family:Georgia,serif;font-size:16px;line-height:1.65;color:#3a3530;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:28px;">
          <tr><td style="height:1px;background:#C9B891;line-height:1px;font-size:1px;">&nbsp;</td></tr>
        </table>
        ${isApproved ? bodyApproved : bodyPending}
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:36px auto 16px;">
          <tr><td align="center" style="background:#0F1A22;border:1px solid #0F1A22;">
            <a href="${link}" style="display:inline-block;padding:18px 44px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:#F7F1E5;text-decoration:none;">
              Definir mi contraseña
            </a>
          </td></tr>
        </table>
        <p style="margin:8px 0 0;text-align:center;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;color:#8b7d5c;letter-spacing:0.3px;">
          o copia este enlace en tu navegador<br>
          <span style="word-break:break-all;color:#5d544a;">${link}</span>
        </p>
      </td></tr>
      <tr><td style="padding:0 48px 32px;background:#F7F1E5;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#FBF5E8;border-left:3px solid #B89968;">
          <tr><td style="padding:18px 22px;font-family:Georgia,serif;font-size:14px;line-height:1.6;color:#3a3530;">
            <p style="margin:0 0 4px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#8b7d5c;">— ¿Por qué este recordatorio?</p>
            Detectamos que aún no has activado tu cuenta nueva. Mientras tanto, no tienes acceso al catálogo ni al historial de tus pedidos. Activa en 30 segundos.
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:28px 48px 36px;background:#F7F1E5;border-top:1px solid #C9B891;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;line-height:1.7;color:#8b7d5c;letter-spacing:0.2px;">
        <p style="margin:0 0 12px;">
          ¿Dudas o no esperabas este mensaje? Escríbenos a <a href="mailto:contacto@dispensariocultimed.cl" style="color:#5d544a;text-decoration:underline;">contacto@dispensariocultimed.cl</a> o por WhatsApp al +56 9 9317 7375.
        </p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
          <tr><td style="padding-top:8px;border-top:1px solid #DCD3C4;">
            <p style="margin:0;font-size:10px;color:#9c8e6e;letter-spacing:0.3px;">
              <strong style="color:#5d544a;">Cultimed</strong> · Asociación de Usuarios de Plantas Medicinales<br>
              Operamos bajo Ley 20.850 y normativa SANNA · Datos clínicos protegidos bajo Ley 19.628<br>
              <a href="https://dispensariocultimed.cl" style="color:#8b7d5c;text-decoration:none;">dispensariocultimed.cl</a>
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
    <p style="margin:24px 0 0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;color:#5d544a;letter-spacing:0.3px;">
      Recibiste este recordatorio porque eres paciente registrado en Cultimed y aún no has activado tu cuenta.
    </p>
  </td></tr>
</table>
</body></html>`;
}

function buildEmailText(opts) {
  const { firstName, link, isApproved } = opts;
  const g = firstName ? `${firstName.split(" ")[0]},` : "Hola.";
  if (isApproved) {
    return `${g}

Hace unos días te enviamos un link para activar tu cuenta en la nueva plataforma Cultimed. Notamos que aún no la has activado, así que te lo reenviamos.

Tu cuenta y receta están migradas — solo falta que definas tu contraseña:
${link}

Link válido por 14 días.

¿Dudas? contacto@dispensariocultimed.cl · WhatsApp +56 9 9317 7375

Cultimed · dispensariocultimed.cl`;
  }
  return `${g}

Hace unos días te enviamos un link para activar tu cuenta en la nueva plataforma Cultimed. Notamos que aún no la has activado, así que te lo reenviamos.

Para activar:
1. Define tu contraseña en este link (válido 14 días):
   ${link}

2. Después, sube una receta médica vigente para que la valide nuestro QF.

¿Dudas? contacto@dispensariocultimed.cl

Cultimed · dispensariocultimed.cl`;
}

async function sendEmail({ to, subject, html, text }) {
  if (DRY_RUN) return { ok: true, id: "dry-run" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: EMAIL_FROM, to: [to], reply_to: EMAIL_REPLY_TO, subject, html, text }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: body?.message || `HTTP ${res.status}` };
  return { ok: true, id: body.id };
}

async function main() {
  console.log(`▶ Modo: ${DRY_RUN ? "DRY RUN" : "REAL — invalida tokens viejos + envía emails"}`);
  console.log(`▶ Postgres: ${DATABASE_URL.replace(/:\/\/[^@]+@/, "://****:****@")}`);
  console.log(`▶ Limit: ${LIMIT === Infinity ? "todos" : LIMIT}`);
  if (ONLY_EMAIL) console.log(`▶ Only: ${ONLY_EMAIL}`);

  const sql = postgres(DATABASE_URL, { prepare: false, ssl: "require", max: 1 });

  // Selecciona customers que NO han activado (password_hash vacío) y NO son skip-list
  const customers = await sql`
    SELECT id, email, full_name, prescription_status
    FROM customer_accounts
    WHERE password_hash = ''
      AND email NOT IN ('rincondeoz@gmail.com', 'contacto@dispensariocultimed.cl')
    ORDER BY prescription_status DESC, full_name
  `;
  console.log(`\n▶ Candidatos (sin password activado): ${customers.length}\n`);

  const stats = {
    total: 0, skipped_filter: 0,
    email_ok: 0, email_failed: 0, tokens_created: 0,
    errors: [],
  };

  for (const c of customers) {
    if (stats.total >= LIMIT) break;
    if (ONLY_EMAIL && c.email !== ONLY_EMAIL) { stats.skipped_filter++; continue; }
    if (SKIP_EMAILS.has(c.email)) { stats.skipped_filter++; continue; }
    stats.total++;

    if (!DRY_RUN) {
      // Invalida tokens previos (sin borrarlos — los marca como ya usados/expirados sería raro,
      // mejor crear uno nuevo. Los viejos no expirados aún funcionarían también si el user los tiene.)
      // Crea token nuevo: 14 días.
      const raw = crypto.randomBytes(32).toString("base64url");
      const tokenHash = crypto.createHash("sha256").update(raw).digest("hex");
      await sql`
        INSERT INTO password_reset_tokens (account_type, account_id, token_hash, expires_at, requested_ip)
        VALUES ('customer', ${c.id}, ${tokenHash},
                CURRENT_TIMESTAMP + (INTERVAL '1 day' * ${TOKEN_TTL_DAYS}),
                'resend-activation')
      `;
      stats.tokens_created++;
      var link = `${PUBLIC_BASE}/recuperar/${raw}`;
    } else {
      var link = `${PUBLIC_BASE}/recuperar/dry-token`;
    }

    const isApproved = c.prescription_status === "aprobada";
    const firstName = (c.full_name || "").trim() || null;
    const subject = isApproved
      ? "Recordatorio · Activa tu cuenta Cultimed (receta lista)"
      : "Recordatorio · Activa tu cuenta Cultimed";
    const html = buildEmailHtml({ firstName, link, isApproved });
    const text = buildEmailText({ firstName, link, isApproved });

    if (DRY_RUN) {
      console.log(`  [DRY] ${c.email} · ${isApproved ? "aprobada" : "pendiente"}`);
    }

    const send = await sendEmail({ to: c.email, subject, html, text });
    if (send.ok) {
      stats.email_ok++;
      if (!DRY_RUN) console.log(`  ✓ ${c.email} · ${isApproved ? "aprobada" : "pendiente"} · ${send.id || "ok"}`);
    } else {
      stats.email_failed++;
      stats.errors.push(`${c.email}: ${send.error}`);
      console.error(`  ✗ ${c.email} · ${send.error}`);
    }

    if (!DRY_RUN) await new Promise((r) => setTimeout(r, 100));
  }

  console.log("\n========== RESUMEN ==========");
  console.log(`  total enviados: ${stats.total}`);
  console.log(`  email_ok: ${stats.email_ok}`);
  console.log(`  email_failed: ${stats.email_failed}`);
  console.log(`  tokens creados: ${stats.tokens_created}`);
  if (stats.errors.length > 0) {
    console.log(`\n  Errores (primeros 5):`);
    stats.errors.slice(0, 5).forEach((e) => console.log(`    - ${e}`));
  }
  console.log("=============================");

  await sql.end();
}

main().catch((e) => { console.error("Error fatal:", e); process.exit(1); });
