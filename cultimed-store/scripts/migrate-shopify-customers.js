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
//   5. Enviar email migración (template editorial Cultimed)
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
  "contacto@dispensariocultimed.cl", // cuenta empresa
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

// ---- CSV parser robusto (maneja comillas + comas en valores) ---------------

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
  // Shopify CSV usa CRLF, sometimes mixed. Normaliza.
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter(l => l.length > 0);
  const headers = parseCsvLine(lines[0]).map(h => h.trim());
  return lines.slice(1).map(line => {
    const cells = parseCsvLine(line);
    const row = {};
    headers.forEach((h, i) => row[h] = (cells[i] ?? "").trim());
    return row;
  });
}

// ---- Normalizers --------------------------------------------------------

function cleanShopifyId(s) {
  // Shopify exporta id como '8673779155161 (con apostrofe)
  return (s || "").replace(/^'/, "").trim();
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
  // En el CSV, el campo "Note" muchas veces tiene el RUT
  const note = (row["Note"] || "").trim();
  if (!note) return null;
  // Limpia formatos típicos: "27.514.215-8", "19515821-5", "21672567-0"
  const m = note.match(/^(\d{1,2}[.,]?\d{3}[.,]?\d{3})[\s-]?([0-9kK])$/);
  if (m) return `${m[1]}-${m[2].toUpperCase()}`.replace(/[.,]/g, "");
  // Si tiene el formato simple: "19515821-5"
  const m2 = note.match(/^(\d{7,8})-?([0-9kK])$/);
  if (m2) return `${m2[1]}-${m2[2].toUpperCase()}`;
  return null;
}

function isApproved(row) {
  const tags = (row["Tags"] || "").toLowerCase();
  return tags.includes("aprobado");
}

// ---- Email template (editorial Cultimed) -------------------------------

function buildEmailHtml(opts) {
  const { firstName, link, isApproved } = opts;
  const greeting = firstName
    ? `Hola, ${firstName}.`
    : "Hola.";

  const bodyApproved = `
    <p>${greeting}</p>
    <p>Migramos Cultimed a una nueva plataforma. Tu cuenta está creada y tu receta médica anterior sigue reconocida — no necesitas volver a subirla.</p>
    <p>Para activar tu cuenta sólo necesitas definir una contraseña nueva. El enlace es válido por <strong>7 días</strong> y solo se puede usar una vez.</p>
  `;
  const bodyNew = `
    <p>${greeting}</p>
    <p>Migramos Cultimed a una nueva plataforma. Tu cuenta de paciente está creada con el mismo email que tenías en nosotros.</p>
    <p>Para activar tu acceso necesitas <strong>definir una contraseña</strong> y, después, <strong>cargar tu receta médica vigente</strong> para que nuestro químico farmacéutico la valide. El enlace para definir tu contraseña dura <strong>7 días</strong>.</p>
  `;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Migración Cultimed</title></head>
<body style="margin:0;padding:0;background:#F2EEE6;font-family:Georgia,serif;color:#1a1a1a;">
<div style="display:none;visibility:hidden;mso-hide:all;font-size:1px;color:#F2EEE6;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">Tu cuenta Cultimed ya está lista en la nueva plataforma. Define tu contraseña.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F2EEE6;">
  <tr><td align="center" style="padding:48px 24px;">
    <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background:#FAF6EE;border:1px solid #DCD3C4;">
      <tr><td style="padding:40px 48px 24px;">
        <p style="margin:0 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#7a7066;">Cultimed · Dispensario</p>
        <h1 style="margin:16px 0 0;font-size:32px;font-weight:300;line-height:1.1;color:#1a1a1a;">${isApproved ? "Tu cuenta migró." : "Bienvenido a la nueva plataforma."}</h1>
        <p style="margin:8px 0 0;font-style:italic;font-size:18px;color:#7a7066;">Define tu contraseña para empezar.</p>
      </td></tr>
      <tr><td style="padding:0 48px 32px;font-size:16px;line-height:1.6;color:#3a3530;">
        ${isApproved ? bodyApproved : bodyNew}
        <div style="margin:32px 0 8px;">
          <a href="${link}" style="display:inline-block;background:#1a1a1a;color:#F2EEE6;padding:14px 32px;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:13px;letter-spacing:1px;text-transform:uppercase;">Definir mi contraseña</a>
        </div>
        <p style="margin:8px 0 0;font-size:12px;color:#7a7066;font-family:monospace;word-break:break-all;">O copia este enlace: ${link}</p>

        ${isApproved ? `
        <div style="margin-top:24px;padding:16px;background:#FBF7EF;border-left:3px solid #C9A96E;font-size:14px;">
          <strong style="color:#3a3530;">Tu receta sigue activa.</strong><br>
          La receta médica que validamos en Shopify la trasladamos. No necesitas volver a subirla.
        </div>` : `
        <div style="margin-top:24px;padding:16px;background:#FBF7EF;border-left:3px solid #C9A96E;font-size:14px;">
          <strong style="color:#3a3530;">Necesitas cargar tu receta.</strong><br>
          Después de definir tu contraseña, sube una receta médica vigente (PDF, JPG o PNG). Nuestro QF la valida en 24 horas hábiles.
        </div>`}
      </td></tr>
      <tr><td style="padding:24px 48px 40px;border-top:1px solid #DCD3C4;font-size:11px;line-height:1.6;color:#7a7066;font-family:Helvetica,Arial,sans-serif;">
        Si no esperabas este mensaje o crees que es un error, escríbenos a contacto@dispensariocultimed.cl
        <br><br>
        Cultimed · Asociación de Usuarios de Plantas Medicinales · dispensariocultimed.cl<br>
        Datos clínicos protegidos bajo Ley 19.628 · Operamos bajo Ley 20.850 y normativa SANNA.
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function buildEmailText(opts) {
  const { firstName, link, isApproved } = opts;
  const g = firstName ? `Hola, ${firstName}.` : "Hola.";
  if (isApproved) {
    return `${g}

Migramos Cultimed a una nueva plataforma. Tu cuenta está creada y tu receta médica anterior sigue reconocida — no necesitas volver a subirla.

Para activar tu cuenta solo define una contraseña nueva. El enlace es válido por 7 días.

${link}

Si no esperabas este mensaje, escríbenos a contacto@dispensariocultimed.cl

Cultimed · Asociación de Usuarios de Plantas Medicinales
dispensariocultimed.cl`;
  }
  return `${g}

Migramos Cultimed a una nueva plataforma. Tu cuenta está creada con el mismo email que tenías con nosotros.

Para activar tu acceso necesitas definir una contraseña nueva y luego cargar tu receta médica vigente. El enlace para definir tu contraseña dura 7 días.

${link}

Si no esperabas este mensaje, escríbenos a contacto@dispensariocultimed.cl

Cultimed · Asociación de Usuarios de Plantas Medicinales
dispensariocultimed.cl`;
}

// ---- Resend send -------------------------------------------------------

async function sendResendEmail({ to, subject, html, text }) {
  if (DRY_RUN) {
    console.log(`  [DRY] would email: ${to} · subject="${subject.slice(0, 60)}"`);
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

    // ¿Existe ya en customer_accounts?
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

    let accountId;
    let token;

    if (DRY_RUN) {
      accountId = "DRY-" + i;
      token = "dry-token-" + crypto.randomBytes(8).toString("hex");
    } else {
      // 1. Crear customer_account
      const created = await sql`
        INSERT INTO customer_accounts (email, password_hash, full_name, rut, phone, prescription_status)
        VALUES (${email}, ${""}, ${name}, ${rut}, ${phone || null}, ${status})
        RETURNING id
      `;
      accountId = created[0].id;

      // 2. Generar token de reset
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

    // 3. Enviar email
    const link = `${PUBLIC_BASE}/recuperar/${token}`;
    const firstName = (row["First Name"] || "").trim() || null;
    const subject = approved
      ? "Migramos a nueva plataforma · Define tu contraseña"
      : "Bienvenido a la nueva plataforma Cultimed";
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

    // Rate limit suave: 50ms entre cada envío para no saturar Resend
    if (!DRY_RUN) await new Promise(r => setTimeout(r, 50));
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
