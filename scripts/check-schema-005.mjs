import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

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
  console.error("DATABASE_URL not set in .env.local");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1 });

try {
  const staffCols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'staff'
      AND column_name IN ('totp_secret', 'totp_enabled', 'updated_at')
    ORDER BY 1`;
  const custCols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customer_accounts'
      AND column_name IN ('is_ambassador', 'ambassador_invited_by', 'ambassador_invited_at')
    ORDER BY 1`;
  const tokTable = await sql`SELECT to_regclass('public.password_reset_tokens') AS reg`;

  const need = {
    staff: ["totp_secret", "totp_enabled", "updated_at"],
    customer_accounts: ["is_ambassador", "ambassador_invited_by", "ambassador_invited_at"],
    password_reset_tokens: !!tokTable[0]?.reg,
  };

  const haveStaff = staffCols.map((r) => r.column_name);
  const haveCust = custCols.map((r) => r.column_name);

  console.log("staff:", haveStaff.join(", ") || "(none)");
  console.log("customer_accounts:", haveCust.join(", ") || "(none)");
  console.log("password_reset_tokens:", tokTable[0]?.reg ? "exists" : "MISSING");

  const missingStaff = need.staff.filter((c) => !haveStaff.includes(c));
  const missingCust = need.customer_accounts.filter((c) => !haveCust.includes(c));
  const missingTable = !need.password_reset_tokens;

  if (missingStaff.length || missingCust.length || missingTable) {
    console.log("\nMIGRATION 005 NEEDED:");
    if (missingStaff.length) console.log("  staff:", missingStaff.join(", "));
    if (missingCust.length) console.log("  customer_accounts:", missingCust.join(", "));
    if (missingTable) console.log("  table: password_reset_tokens");
    process.exitCode = 2;
  } else {
    console.log("\nMigration 005: OK (all present)");
  }
} catch (e) {
  console.error("DB error:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}