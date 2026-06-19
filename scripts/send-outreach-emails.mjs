#!/usr/bin/env node
/**
 * Campaña outbound automatizada — emails vía Resend.
 *
 * Segmentos:
 *   all               — un email por paciente (plantilla de mayor prioridad)
 *   complete_profile  — ficha incompleta (RUT, teléfono, comuna, etc.)
 *   missing_docs      — docs críticos faltantes (receta o carnet)
 *   no_valid_rx       — sin receta válida (subir/resubir)
 *   no_web_account    — sin cuenta web → registro
 *   activation_reminder — cuenta creada sin contraseña
 *
 * Uso:
 *   node scripts/send-outreach-emails.mjs --segment all
 *   node scripts/send-outreach-emails.mjs --segment missing_docs --limit 5 --apply
 *   node scripts/send-outreach-emails.mjs --segment all --apply --cooldown-days 0 --json
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { SEGMENTS, sendOutreachCampaign } from "./lib/outreach-campaign.mjs";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(path.join(root, "cultimed-store/package.json"));
const postgres = require("postgres");

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const JSON_OUT = args.includes("--json");

function argValue(flag, fallback) {
  const i = args.indexOf(flag);
  if (i < 0) return fallback;
  return args[i + 1];
}

const SEGMENT = argValue("--segment", "all");
const LIMIT_RAW = argValue("--limit", "");
const LIMIT = LIMIT_RAW ? parseInt(LIMIT_RAW, 10) : Infinity;
const COOLDOWN_DAYS = parseInt(argValue("--cooldown-days", "7"), 10);

const envPath = path.join(root, "cultimed-store", ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

if (!process.env.DATABASE_URL) {
  console.error("✗ DATABASE_URL no definido (cultimed-store/.env.local)");
  process.exit(1);
}

if (!SEGMENTS.includes(SEGMENT)) {
  console.error(`✗ Segmento inválido: ${SEGMENT}`);
  console.error(`  Válidos: ${SEGMENTS.join(", ")}`);
  process.exit(1);
}

if (!APPLY && !process.env.RESEND_API_KEY) {
  // dry-run no requiere Resend
}

if (APPLY && !process.env.RESEND_API_KEY) {
  console.error("✗ RESEND_API_KEY requerido para --apply");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1 });

try {
  const stats = await sendOutreachCampaign(sql, {
    apply: APPLY,
    segment: SEGMENT,
    limit: LIMIT,
    cooldownDays: COOLDOWN_DAYS,
    storeBase: process.env.NEXT_PUBLIC_BASE_URL || "https://dispensariocultimed.cl",
    resendApiKey: process.env.RESEND_API_KEY,
    emailFrom: process.env.EMAIL_FROM || "Cultimed <no-reply@dispensariocultimed.cl>",
    emailReplyTo: process.env.EMAIL_REPLY_TO || "contacto@dispensariocultimed.cl",
    staffId: null,
  });

  if (JSON_OUT) {
    console.log(JSON.stringify(stats, null, 2));
  } else {
    console.log("\n=== CultiSoft · Campaña emails ===");
    console.log(`Modo: ${stats.mode.toUpperCase()}`);
    console.log(`Segmento: ${stats.segment}`);
    console.log(`Cola: ${stats.queued} (candidatos totales: ${stats.totalCandidates})`);
    console.log(`Enviados/preview: ${stats.sent} · Fallidos: ${stats.failed}`);
    console.log(
      `Omitidos — cooldown: ${stats.skipped.cooldown} · sin email: ${stats.skipped.no_email} · merged: ${stats.skipped.merged} · otro segmento: ${stats.skipped.segment}`
    );
    if (stats.preview.length) {
      console.log("\n--- Preview (primeros 15) ---");
      for (const row of stats.preview.slice(0, 15)) {
        console.log(
          `  #${row.patient_id} · ${row.name} · ${row.email} · ${row.template} · ${row.reason}`
        );
      }
      if (stats.preview.length > 15) console.log(`  ... +${stats.preview.length - 15} más`);
    }
    if (stats.errors.length) {
      console.log("\n--- Errores ---");
      for (const e of stats.errors.slice(0, 10)) {
        console.log(`  #${e.patient_id} · ${e.email || ""} · ${e.error}`);
      }
    }
    if (!APPLY && stats.queued > 0) {
      console.log("\nDry-run OK. Re-ejecuta con --apply para enviar.");
    }
  }

  process.exit(stats.failed > 0 && APPLY ? 1 : 0);
} finally {
  await sql.end();
}