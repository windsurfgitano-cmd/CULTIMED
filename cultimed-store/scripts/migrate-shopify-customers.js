// Migración masiva de pacientes Shopify → Supabase + envío de email "Define tu contraseña".
//
// Lee customers_export.csv (parsed naive — Shopify CSV es bastante regular)
// Para cada paciente:
//   1. Si ya existe en customer_accounts → skip
//   2. Si email vacío o == contacto@dispensariocultimed.cl → skip
//   3. Crear cuenta:
//      - email + nombre + RUT + teléfono
//      - prescription_status = 'aprobada' si tag contiene "aprobado", sino 'none'
//      - password_hash = "" (forzar reset)
//   4. Crear token de reset 7 días
//   5. Enviar email migración (template editorial Cultimed apotecario)
//
// Modos:
//   --dry-run         : NO escribe BD ni envía emails. Solo muestra preview.
//   --dry-run --verbose : muestra parser CSV detallado
//   (sin flag)        : ejecuta migración real
//   --limit N         : solo procesa N pacientes (test rápido)
//   --only-email X    : solo procesa la cuenta cuyo email coincide
//
// Uso:
//   DATABASE_URL=... RESEND_API_KEY=... NEXT_PUBLIC_BASE_URL=... \
//     node scripts/migrate-shopify-customers.js --dry-run

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const postgres = require("postgres");

const DATABASE_URL = process.env.DATABASE_URL;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const PUBLIC_BASE = process.env.NEXT_PUBLIC_BASE_URL || "https://app.dispensariocultimed.cl";
const EMAIL_FROM = process.env.EMAIL_FROM || "Cultimed <no-reply@dispensariocultimed.cl>";
const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO || "contacto@dispensariocultimed.cl";
const HERO_IMAGE = process.env.HERO_IMAGE ||
  "https://ibkhvopshhlbvjwrmuzm.supabase.co/storage/v1/object/public/email-assets/apothecary-hero.png";
const LOGO_IMAGE = process.env.LOGO_IMAGE ||
  "https://ibkhvopshhlbvjwrmuzm.supabase.co/storage/v1/object/public/email-assets/cultimed-logo-gold.png";
const CSV_PATH = process.env.CSV_PATH ||
  path.resolve(__dirname, "..", "..", "..", "Downloads", "cutlimeddb", "customers_export.csv");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const VERBOSE = args.includes("--verbose");
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;
const onlyIdx = args.indexOf("--only-email");
const ONLY_EMAIL = onlyIdx >= 0 ? args[onlyIdx + 1].toLowerCase() : null;

const TOKEN_TTL_DAYS = 7;
const SKIP_EMAILS = new Set([
  "contacto@dispensariocultimed.cl",
]);

if (!DATABASE_URL) {
  console.error("✗ DATABASE_URL no definido"); process.exit(1);
}
if (!fs.existsSync(CSV_PATH)) {
  console.error(`✗ CSV no encontrado: ${CSV_PATH}`); process.exit(1);
}
if (!DRY_RUN && !RESEND_API_KEY) {
  console.error("✗ RESEND_API_KEY no definido (requerido para envío real). Usa --dry-run para preview.");
  process.exit(1);
}

// ---- CSV parser robusto ---------------------------------------------------

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { cur += c; }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { out.push(cur); cur = ""; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

function parseCsv(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter(l => l.length > 0);
  const headers = parseCsvLine(lines[0]).map(h => h.trim());
  return lines.slice(1).map(line => {
    const cells = parseCsvLine(line);
    const row = {};
    headers.forEach((h, i) => row[h] = (cells[i] ?? "").trim());
    return row;
  });
}

function cleanPhone(s) {
  return (s || "").replace(/^'/, "").trim();
}

function fullName(row) {
  const f = (row["First Name"] || "").trim();
  const l = (row["Last Name"] || "").trim();
  const n = `${f} ${l}`.trim();
  return n || null;
}

function rutFromNote(row) {
  const note = (row["Note"] || "").trim();
  if (!note) return null;
  const m = note.match(/^(\d{1,2}[.,]?\d{3}[.,]?\d{3})[\s-]?([0-9kK])$/);
  if (m) return `${m[1]}-${m[2].toUpperCase()}`.replace(/[.,]/g, "");
  const m2 = note.match(/^(\d{7,8})-?([0-9kK])$/);
  if (m2) return `${m2[1]}-${m2[2].toUpperCase()}`;
  return null;
}

function isApproved(row) {
  const tags = (row["Tags"] || "").toLowerCase();
  return tags.includes("aprobado");
}

// ---- Email template editorial apotecario ---------------------------------

function buildEmailHtml(opts) {
  const { firstName, link, isApproved } = opts;
  const greeting = firstName ? `${firstName.split(" ")[0]},` : "Hola.";

  const heroSubtitle = isApproved
    ? "Tu cuenta migró. Tu receta sigue activa."
    : "Una nueva plataforma. Tu acceso, intacto.";

  const bodyApproved = `
    <p style="margin:0 0 16px;">${greeting}</p>
    <p style="margin:0 0 16px;">Cultimed se mudó a una plataforma propia, hecha a la medida del dispensario. La construimos con un sólo principio: que la dispensación de cannabis medicinal en Chile se sienta como debiera sentirse — clínica, discreta, precisa.</p>
    <p style="margin:0 0 16px;">Tu cuenta ya viaja con nosotros. <strong>Tu receta médica anterior sigue reconocida</strong> — el químico farmacéutico ya la validó. Solo falta que definas una contraseña nueva para empezar a usarla.</p>
    <p style="margin:0;color:#7a7066;font-size:14px;font-style:italic;">El enlace es válido por 7 días y solo puede usarse una vez.</p>
  `;

  const bodyNew = `
    <p style="margin:0 0 16px;">${greeting}</p>
    <p style="margin:0 0 16px;">Cultimed se mudó a una plataforma propia, hecha a la medida del dispensario. La construimos con un sólo principio: que la dispensación de cannabis medicinal en Chile se sienta como debiera sentirse — clínica, discreta, precisa.</p>
    <p style="margin:0 0 16px;">Tu cuenta ya viaja con nosotros, pero todavía no estás del todo activado. Necesitas dos cosas: <strong>definir tu contraseña</strong> y <strong>cargar una receta médica vigente</strong> para que nuestro químico farmacéutico la valide.</p>
    <p style="margin:0;color:#7a7066;font-size:14px;font-style:italic;">El enlace para definir tu contraseña dura 7 días.</p>
  `;

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Migración Cultimed</title></head>
<body style="margin:0;padding:0;background:#0F1A22;font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;-webkit-font-smoothing:antialiased;">

<!-- Preheader hidden -->
<div style="display:none;visibility:hidden;mso-hide:all;font-size:1px;color:#0F1A22;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
  Cultimed migró. Tu cuenta está lista — define tu contraseña en 30 segundos.
</div>

<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#0F1A22;">
  <tr><td align="center" style="padding:48px 16px;">

    <!-- Card container -->
    <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background:#F7F1E5;border:1px solid #C9B891;">

      <!-- Hero image -->
      <tr><td align="center" style="padding:36px 48px 24px;background:#F7F1E5;">
        <img src="${LOGO_IMAGE}" alt="Cultimed · Cultivando Salud" width="160" style="display:block;width:160px;max-width:60%;height:auto;border:0;margin:0 auto;" />
      </td></tr>

      <tr><td style="padding:0;line-height:0;">
        <img src="${HERO_IMAGE}" alt="Cultimed · Dispensario de cannabis medicinal" width="600" style="display:block;width:100%;height:auto;border:0;" />
      </td></tr>

      <!-- Hero text overlay area -->
      <tr><td style="padding:36px 48px 24px;background:#F7F1E5;">
        <p style="margin:0 0 12px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:#8b7d5c;">
          Cultimed · Dispensario clínico
        </p>
        <h1 style="margin:0 0 6px;font-family:Georgia,serif;font-size:36px;font-weight:300;line-height:1.05;color:#1a1a1a;letter-spacing:-0.5px;">
          ${isApproved ? "Tu cuenta" : "Una nueva"} <em style="font-style:italic;font-weight:400;color:#1a1a1a;">${isApproved ? "migró" : "plataforma"}</em>${isApproved ? "." : "."}
        </h1>
        <p style="margin:0;font-family:Georgia,serif;font-size:18px;font-style:italic;color:#5d544a;line-height:1.4;">
          ${heroSubtitle}
        </p>
      </td></tr>

      <!-- Body -->
      <tr><td style="padding:0 48px 32px;background:#F7F1E5;font-family:Georgia,serif;font-size:16px;line-height:1.65;color:#3a3530;">

        <!-- Hairline divider -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:28px;">
          <tr><td style="height:1px;background:#C9B891;line-height:1px;font-size:1px;">&nbsp;</td></tr>
        </table>

        ${isApproved ? bodyApproved : bodyNew}

        <!-- CTA -->
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

      <!-- Notice card -->
      ${isApproved ? `
      <tr><td style="padding:0 48px 32px;background:#F7F1E5;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#FBF5E8;border-left:3px solid #B89968;">
          <tr><td style="padding:18px 22px;font-family:Georgia,serif;font-size:14px;line-height:1.6;color:#3a3530;">
            <p style="margin:0 0 4px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#8b7d5c;">— Tu receta sigue activa</p>
            La receta médica que validamos en la plataforma anterior se trasladó automáticamente. No necesitas volver a subirla.
          </td></tr>
        </table>
      </td></tr>
      ` : `
      <tr><td style="padding:0 48px 32px;background:#F7F1E5;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#FBF5E8;border-left:3px solid #B89968;">
          <tr><td style="padding:18px 22px;font-family:Georgia,serif;font-size:14px;line-height:1.6;color:#3a3530;">
            <p style="margin:0 0 4px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#8b7d5c;">— Receta requerida</p>
            Después de definir tu contraseña, sube una receta médica vigente (PDF, JPG o PNG, máx 8 MB). Nuestro químico farmacéutico la valida en menos de 24 horas hábiles.
          </td></tr>
        </table>
      </td></tr>
      `}

      <!-- Footer -->
      <tr><td style="padding:28px 48px 36px;background:#F7F1E5;border-top:1px solid #C9B891;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;line-height:1.7;color:#8b7d5c;letter-spacing:0.2px;">
        <p style="margin:0 0 12px;">
          ¿Dudas o no esperabas este mensaje? Escríbenos a <a href="mailto:contacto@dispensariocultimed.cl" style="color:#5d544a;text-decoration:underline;">contacto@dispensariocultimed.cl</a>
        </p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
          <tr><td style="padding-top:8px;border-top:1px solid #DCD3C4;">
            <p style="margin:0;font-size:10px;color:#9c8e6e;letter-spacing:0.3px;">
              <strong style="color:#5d544a;">Cultimed</strong> · Asociación de Usuarios de Plantas Medicinales<br>
              Operamos bajo Ley 20.850 y normativa SANNA · Datos clínicos protegidos bajo Ley 19.628<br>
              <a href="https://app.dispensariocultimed.cl" style="color:#8b7d5c;text-decoration:none;">dispensariocultimed.cl</a>
            </p>
          </td></tr>
        </table>
      </td></tr>

    </table>
    <!-- /Card -->

    <p style="margin:24px 0 0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;color:#5d544a;letter-spacing:0.3px;">
      Recibiste este correo porque eres paciente registrado en Cultimed.
    </p>

  </td></tr>
</table>
</body>
</html>`;
}

function buildEmailText(opts) {
  const { firstName, link, isApproved } = opts;
  const g = firstName ? `${firstName.split(" ")[0]},` : "Hola.";
  if (isApproved) {
    return `${g}

Cultimed se mudó a una plataforma propia. Tu cuenta migró con nosotros y tu receta médica anterior sigue reconocida — solo necesitas definir una contraseña nueva.

Definir mi contraseña:
${link}

El enlace es válido por 7 días y solo puede usarse una vez.

¿Dudas? contacto@dispensariocultimed.cl

Cultimed · Asociación de Usuarios de Plantas Medicinales
dispensariocultimed.cl
Operamos bajo Ley 20.850 y normativa SANNA.`;
  }
  return `${g}

Cultimed se mudó a una plataforma propia. Tu cuenta migró con nosotros, pero todavía no está del todo activada. Necesitas:

1. Definir tu contraseña en este enlace (válido 7 días):
   ${link}

2. Después, cargar una receta médica vigente para que nuestro químico farmacéutico la valide.

¿Dudas? contacto@dispensariocultimed.cl

Cultimed · Asociación de Usuarios de Plantas Medicinales
dispensariocultimed.cl
Operamos bajo Ley 20.850 y normativa SANNA.`;
}

// ---- Resend send -------------------------------------------------------

async function sendResendEmail({ to, subject, html, text }) {
  if (DRY_RUN) {
    console.log(`  [DRY] ${to} · "${subject.slice(0, 60)}"`);
    return { ok: true, id: "dry-run" };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [to],
      reply_to: EMAIL_REPLY_TO,
      subject, html, text,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: body?.message || `HTTP ${res.status}` };
  }
  return { ok: true, id: body.id };
}

// ---- Main --------------------------------------------------------------

async function main() {
  console.log(`\n▶ Modo: ${DRY_RUN ? "DRY RUN" : "REAL — escribe BD + envía emails"}`);
  console.log(`▶ CSV: ${CSV_PATH}`);
  console.log(`▶ Postgres: ${DATABASE_URL.replace(/:[^:@]+@/, ":****@")}`);
  console.log(`▶ Hero image: ${HERO_IMAGE}`);
  console.log(`▶ Limit: ${LIMIT === Infinity ? "todos" : LIMIT}`);
  if (ONLY_EMAIL) console.log(`▶ Only: ${ONLY_EMAIL}`);

  const csvText = fs.readFileSync(CSV_PATH, "utf8");
  const rows = parseCsv(csvText);
  console.log(`\n▶ Filas en CSV: ${rows.length}\n`);

  const sql = postgres(DATABASE_URL, { max: 1, ssl: "require", prepare: false });

  const stats = {
    total: 0, skipped_no_email: 0, skipped_company: 0,
    skipped_already_exists: 0,
    created_approved: 0, created_pending: 0,
    email_ok: 0, email_failed: 0,
  };

  for (let i = 0; i < rows.length; i++) {
    if (stats.total >= LIMIT) break;
    const row = rows[i];
    const email = (row["Email"] || "").trim().toLowerCase();
    if (!email) { stats.skipped_no_email++; continue; }
    if (SKIP_EMAILS.has(email)) { stats.skipped_company++; continue; }
    if (ONLY_EMAIL && email !== ONLY_EMAIL) continue;

    stats.total++;

    const exists = await sql`SELECT id FROM customer_accounts WHERE email = ${email}`;
    if (exists.length > 0) {
      console.log(`  ↩ ${email} — ya existe (skip)`);
      stats.skipped_already_exists++;
      continue;
    }

    const name = fullName(row);
    const rut = rutFromNote(row);
    const phone = cleanPhone(row["Phone"] || row["Default Address Phone"]);
    const approved = isApproved(row);
    const status = approved ? "aprobada" : "none";

    if (VERBOSE) {
      console.log(`  · ${email} · name=${name || "—"} · rut=${rut || "—"} · phone=${phone || "—"} · ${status}`);
    }

    let accountId, token;

    if (DRY_RUN) {
      accountId = "DRY-" + i;
      token = "dry-token-" + crypto.randomBytes(8).toString("hex");
    } else {
      const created = await sql`
        INSERT INTO customer_accounts (email, password_hash, full_name, rut, phone, prescription_status)
        VALUES (${email}, ${""}, ${name}, ${rut}, ${phone || null}, ${status})
        RETURNING id
      `;
      accountId = created[0].id;

      const rawToken = crypto.randomBytes(32).toString("base64url");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      await sql`
        INSERT INTO password_reset_tokens (account_type, account_id, token_hash, expires_at, requested_ip)
        VALUES ('customer', ${accountId}, ${tokenHash},
                CURRENT_TIMESTAMP + (INTERVAL '1 day' * ${TOKEN_TTL_DAYS}),
                'shopify-migration')
      `;
      token = rawToken;
    }

    if (approved) stats.created_approved++; else stats.created_pending++;

    const link = `${PUBLIC_BASE}/recuperar/${token}`;
    const firstName = (row["First Name"] || "").trim() || null;
    const subject = approved
      ? "Tu cuenta migró · Define tu contraseña — Cultimed"
      : "Bienvenido a la nueva plataforma — Cultimed";
    const html = buildEmailHtml({ firstName, link, isApproved: approved });
    const text = buildEmailText({ firstName, link, isApproved: approved });

    const send = await sendResendEmail({ to: email, subject, html, text });
    if (send.ok) {
      stats.email_ok++;
      if (!DRY_RUN) console.log(`  ✓ ${email} · ${status} · sent (${send.id || "?"})`);
    } else {
      stats.email_failed++;
      console.error(`  ✗ ${email} · ${status} · email failed: ${send.error}`);
    }

    if (!DRY_RUN) await new Promise(r => setTimeout(r, 100));
  }

  console.log("\n========== RESUMEN ==========");
  for (const [k, v] of Object.entries(stats)) console.log(`  ${k}: ${v}`);
  console.log("=============================");

  await sql.end();
}

main().catch((e) => {
  console.error("Error fatal:", e);
  process.exit(1);
});
