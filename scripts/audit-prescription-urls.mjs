#!/usr/bin/env node
/**
 * Audita prescription_url en customer_accounts: verifica que el objeto exista en Supabase Storage.
 * Solo lectura — no modifica la BD.
 *
 * Uso: node scripts/audit-prescription-urls.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(path.join(root, "cultimed-store/package.json"));
const postgres = require("postgres");
const { createClient } = require("@supabase/supabase-js");

// ── Env (cultimed-store + cultisoft + root) ──────────────────────────────────

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    const key = m[1];
    const val = m[2].replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile(path.join(root, "cultimed-store", ".env.local"));
loadEnvFile(path.join(root, "cultisoft", ".env.local"));
loadEnvFile(path.join(root, ".env.local"));

const DATABASE_URL = process.env.DATABASE_URL;
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!DATABASE_URL) {
  console.error(
    "DATABASE_URL no definido (revisa cultimed-store/.env.local o cultisoft/.env.local)"
  );
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error(
    "Supabase no configurado: falta NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY"
  );
  process.exit(1);
}

const STANDARD_REF_RE =
  /^(prescriptions|payment-proofs|patient-documents|documents):\/\/(.+)$/;
const BUCKET_PREFIX_RE =
  /^bucket:\/\/(prescriptions|payment-proofs|patient-documents|documents)\/(.+)$/;

function parseStorageRef(stored) {
  const value = String(stored || "").trim();
  if (!value) return null;

  const standard = value.match(STANDARD_REF_RE);
  if (standard) {
    return { bucket: standard[1], objectPath: standard[2], format: "standard" };
  }

  const prefixed = value.match(BUCKET_PREFIX_RE);
  if (prefixed) {
    return { bucket: prefixed[1], objectPath: prefixed[2], format: "bucket-prefix" };
  }

  return null;
}

function classifyDownloadError(error) {
  const msg = String(error?.message || error || "").toLowerCase();
  const status = error?.status || error?.statusCode;

  if (
    status === 404 ||
    msg.includes("not found") ||
    msg.includes("object not found") ||
    msg.includes("404")
  ) {
    return "missing";
  }
  return "error";
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

async function checkPrescriptionUrl(stored) {
  const ref = parseStorageRef(stored);
  if (!ref) {
    return { status: "invalid_ref", detail: "no storage ref reconocible", ref: null };
  }

  const { data, error } = await supabase.storage
    .from(ref.bucket)
    .download(ref.objectPath);

  if (error || !data) {
    const kind = classifyDownloadError(error);
    if (kind === "missing") {
      return {
        status: "missing",
        detail: error?.message || "object not found",
        ref,
      };
    }
    return {
      status: "error",
      detail: error?.message || "download failed",
      ref,
    };
  }

  return {
    status: "ok",
    detail: `${data.size ?? data.byteLength ?? "?"} bytes`,
    ref,
  };
}

function section(title) {
  console.log(`\n=== ${title} ===\n`);
}

const sql = postgres(DATABASE_URL, { ssl: "require", max: 1 });

try {
  console.log("CULTISOFT · Auditoría prescription_url (Supabase Storage)");
  console.log(`Fecha: ${new Date().toISOString()}`);

  const accounts = await sql`
    SELECT id, email, full_name, prescription_url, prescription_status
    FROM customer_accounts
    WHERE prescription_url IS NOT NULL
      AND TRIM(prescription_url) <> ''
    ORDER BY id
  `;

  section("RESUMEN");
  console.log(`Cuentas con prescription_url: ${accounts.length}`);

  const results = {
    ok: [],
    missing: [],
    invalid_ref: [],
    error: [],
  };

  for (const account of accounts) {
    const check = await checkPrescriptionUrl(account.prescription_url);
    const entry = {
      id: Number(account.id),
      email: account.email,
      full_name: account.full_name,
      prescription_status: account.prescription_status,
      prescription_url: account.prescription_url,
      detail: check.detail,
      bucket: check.ref?.bucket ?? null,
      objectPath: check.ref?.objectPath ?? null,
      ref_format: check.ref?.format ?? null,
    };
    results[check.status].push(entry);
  }

  console.log(`  ok:          ${results.ok.length}`);
  console.log(`  missing:     ${results.missing.length}`);
  console.log(`  invalid_ref: ${results.invalid_ref.length}`);
  if (results.error.length) {
    console.log(`  error:       ${results.error.length}`);
  }

  const okStandard = results.ok.filter((r) => r.ref_format === "standard").length;
  const okBucketPrefix = results.ok.filter((r) => r.ref_format === "bucket-prefix").length;
  if (okBucketPrefix) {
    console.log(
      `\n  Nota: ${okBucketPrefix} cuentas usan formato legacy bucket://bucket/path`
    );
    console.log(
      "        (archivo existe, pero resolveStorageUrl/batch-OCR no lo parsean sin fix)"
    );
    console.log(`        standard patient-documents://: ${okStandard}`);
  }

  const failures = [...results.missing, ...results.invalid_ref, ...results.error];

  section(`FALLAS (${failures.length}) — requieren revisión manual`);
  if (!failures.length) {
    console.log("  (ninguna)");
  } else {
    for (const row of failures) {
      const status = results.missing.includes(row)
        ? "missing"
        : results.invalid_ref.includes(row)
          ? "invalid_ref"
          : "error";
      console.log(
        `  [${status}] id=${row.id} email=${row.email} status=${row.prescription_status}`
      );
      console.log(`           stored: ${row.prescription_url}`);
      if (row.detail) console.log(`           detail: ${row.detail}`);
    }
  }

  if (results.missing.length) {
    section("MISSING (404) — archivo no existe en Storage");
    for (const row of results.missing) {
      console.log(
        `  id=${row.id}  ${row.email}  ${row.bucket}://${row.objectPath}`
      );
    }
  }

  if (results.invalid_ref.length) {
    section("INVALID REF — no es prescriptions:// ni bucket://bucket/path");
    for (const row of results.invalid_ref) {
      console.log(`  id=${row.id}  ${row.email}  ${row.prescription_url}`);
    }
  }

  if (results.error.length) {
    section("ERRORS — fallo distinto a 404");
    for (const row of results.error) {
      console.log(`  id=${row.id}  ${row.email}  ${row.detail}`);
      console.log(`           stored: ${row.prescription_url}`);
    }
  }

  process.exit(failures.length ? 1 : 0);
} catch (err) {
  console.error(err);
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}