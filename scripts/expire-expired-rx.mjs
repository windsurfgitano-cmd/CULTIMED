#!/usr/bin/env node
/**
 * Marca como vencidas las recetas (prescriptions) activas cuya expiry_date < hoy.
 *
 * Uso:
 *   node scripts/expire-expired-rx.mjs           # dry-run (default)
 *   node scripts/expire-expired-rx.mjs --apply   # aplica UPDATE + audit_logs
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const APPLY = process.argv.includes("--apply");

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(path.join(root, "cultimed-store/package.json"));
const postgres = require("postgres");

const envPath = path.join(root, "cultimed-store", ".env.local");
if (!fs.existsSync(envPath)) {
  console.error("Missing cultimed-store/.env.local");
  process.exit(1);
}

for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^DATABASE_URL=(.+)$/);
  if (m) process.env.DATABASE_URL = m[1].replace(/^["']|["']$/g, "");
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1 });

async function resolveAuditStaffId() {
  const [row] = await sql`
    SELECT id FROM staff
    WHERE id = 1 AND role = 'superadmin'
    LIMIT 1
  `;
  return row?.id ?? null;
}

try {
  console.log("CULTISOFT · Expire active prescriptions past expiry_date");
  console.log(`Fecha: ${new Date().toISOString()}`);
  console.log(`Modo: ${APPLY ? "APPLY" : "DRY-RUN"}\n`);

  const expired = await sql`
    SELECT id, folio, patient_id, expiry_date
    FROM prescriptions
    WHERE status = 'active'
      AND expiry_date < CURRENT_DATE
    ORDER BY expiry_date, id
  `;

  console.log(`Active prescriptions past expiry_date: ${expired.length}\n`);

  if (!expired.length) {
    console.log("Nothing to expire.");
    console.log("✅ Done");
    process.exit(0);
  }

  console.log(APPLY ? "Expiring:" : "Would expire:");
  for (const row of expired) {
    console.log(
      `  #${row.id} folio=${row.folio} patient_id=${row.patient_id} expiry_date=${row.expiry_date}`
    );
  }
  console.log("");

  if (!APPLY) {
    console.log("Dry-run complete. Re-run with --apply to mark as expired and write audit_logs.");
    process.exit(0);
  }

  const staffId = await resolveAuditStaffId();
  console.log(`Audit staff_id: ${staffId ?? "NULL"}\n`);

  let updated = 0;
  for (const row of expired) {
    const result = await sql`
      UPDATE prescriptions
      SET status = 'expired',
          updated_at = NOW()
      WHERE id = ${row.id}
        AND status = 'active'
        AND expiry_date < CURRENT_DATE
      RETURNING id
    `;

    if (!result.length) continue;

    await sql`
      INSERT INTO audit_logs (staff_id, action, entity_type, entity_id, details)
      VALUES (
        ${staffId},
        'prescription_expired_auto',
        'prescription',
        ${row.id},
        ${sql.json({
          folio: row.folio,
          patient_id: row.patient_id,
          expiry_date: row.expiry_date,
          previous_status: "active",
          new_status: "expired",
        })}
      )
    `;

    updated++;
  }

  console.log(`✅ Applied: ${updated} prescription(s) marked expired`);
} catch (e) {
  console.error("Error:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}