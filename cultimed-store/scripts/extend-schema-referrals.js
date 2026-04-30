// Extend the shared cultisoft.db with the Referrals / Embajadores program tables.
// Idempotent (uses IF NOT EXISTS + safe ALTER).
const Database = require("better-sqlite3");
const path = require("node:path");
const fs = require("node:fs");

const DB_PATH = process.env.DB_PATH || "../cultisoft/data/cultisoft.db";
const abs = path.isAbsolute(DB_PATH) ? DB_PATH : path.resolve(process.cwd(), DB_PATH);

if (!fs.existsSync(abs)) {
  console.error(`✗ DB not found: ${abs}`);
  console.error(`  Run \`npm run db:reset:clean\` in ../cultisoft first.`);
  process.exit(1);
}

const db = new Database(abs);
db.pragma("foreign_keys = ON");

const ddl = `
-- Códigos de referido (un embajador, un código activo principal).
CREATE TABLE IF NOT EXISTS referral_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ambassador_account_id INTEGER NOT NULL UNIQUE REFERENCES customer_accounts(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Datos bancarios del embajador (para transferencias mensuales).
CREATE TABLE IF NOT EXISTS ambassador_bank_info (
  ambassador_account_id INTEGER PRIMARY KEY REFERENCES customer_accounts(id) ON DELETE CASCADE,
  bank_name TEXT NOT NULL,
  account_type TEXT NOT NULL, -- corriente | vista | rut | ahorro
  account_number TEXT NOT NULL,
  account_holder_name TEXT NOT NULL,
  account_holder_rut TEXT NOT NULL,
  contact_email TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Conversiones: cada paciente referido (1 por cuenta nueva).
-- Nota: el embajador queda registrado al momento del registro vía cookie/link.
-- Se "activa" cuando se aprueba la receta del referido.
-- Se "convierte" cuando paga su primer pedido.
-- Caduca 365 días tras la primera compra pagada.
CREATE TABLE IF NOT EXISTS referral_conversions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code_id INTEGER NOT NULL REFERENCES referral_codes(id) ON DELETE RESTRICT,
  ambassador_account_id INTEGER NOT NULL REFERENCES customer_accounts(id) ON DELETE RESTRICT,
  referred_account_id INTEGER NOT NULL UNIQUE REFERENCES customer_accounts(id) ON DELETE CASCADE,
  registered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  prescription_approved_at TEXT,
  first_order_id INTEGER REFERENCES customer_orders(id),
  first_order_paid_at TEXT,
  expires_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  -- pending: cookie matched at registro, sin receta aprobada
  -- active: receta aprobada, sin primer pedido pagado
  -- converted: primer pedido pagado → comisión 10% generada
  -- expired: 365 días desde primer pago
  -- cancelled: admin canceló por antifraude
  cancelled_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Payouts (transferencias mensuales agrupadas).
CREATE TABLE IF NOT EXISTS referral_payouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ambassador_account_id INTEGER NOT NULL REFERENCES customer_accounts(id) ON DELETE RESTRICT,
  period_start TEXT NOT NULL, -- YYYY-MM-01
  period_end TEXT NOT NULL,   -- último día del mes
  total_amount INTEGER NOT NULL,
  bank_reference TEXT,
  notes TEXT,
  paid_at TEXT,
  paid_by INTEGER REFERENCES staff(id),
  status TEXT NOT NULL DEFAULT 'pending', -- pending | paid | failed
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Comisiones por pedido del referido. Una "first" + N "historical" mientras esté vigente.
CREATE TABLE IF NOT EXISTS referral_commissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversion_id INTEGER NOT NULL REFERENCES referral_conversions(id) ON DELETE RESTRICT,
  ambassador_account_id INTEGER NOT NULL REFERENCES customer_accounts(id) ON DELETE RESTRICT,
  order_id INTEGER NOT NULL REFERENCES customer_orders(id) ON DELETE RESTRICT,
  type TEXT NOT NULL, -- 'first' (10%) | 'historical' (1%)
  base_amount INTEGER NOT NULL,
  rate_bps INTEGER NOT NULL, -- 1000 = 10%, 100 = 1%
  amount INTEGER NOT NULL,
  payout_id INTEGER REFERENCES referral_payouts(id),
  status TEXT NOT NULL DEFAULT 'pending', -- pending | paid | voided
  generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(order_id, type)
);

CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes(code);
CREATE INDEX IF NOT EXISTS idx_referral_conversions_amb ON referral_conversions(ambassador_account_id);
CREATE INDEX IF NOT EXISTS idx_referral_conversions_referred ON referral_conversions(referred_account_id);
CREATE INDEX IF NOT EXISTS idx_referral_conversions_status ON referral_conversions(status);
CREATE INDEX IF NOT EXISTS idx_referral_commissions_amb ON referral_commissions(ambassador_account_id);
CREATE INDEX IF NOT EXISTS idx_referral_commissions_status ON referral_commissions(status);
CREATE INDEX IF NOT EXISTS idx_referral_commissions_payout ON referral_commissions(payout_id);
CREATE INDEX IF NOT EXISTS idx_referral_payouts_amb ON referral_payouts(ambassador_account_id);
CREATE INDEX IF NOT EXISTS idx_referral_payouts_status ON referral_payouts(status);
`;

db.exec(ddl);

// Safe ALTER TABLE: add columns to customer_orders for tracking discount + linkage.
// SQLite no soporta IF NOT EXISTS en ALTER, hacemos try/catch idempotente.
function safeAlter(sql) {
  try {
    db.exec(sql);
    console.log(`  + ${sql}`);
  } catch (e) {
    if (String(e.message).includes("duplicate column")) {
      // ya existe, ignorar
    } else {
      throw e;
    }
  }
}

safeAlter(`ALTER TABLE customer_orders ADD COLUMN referral_conversion_id INTEGER REFERENCES referral_conversions(id)`);
safeAlter(`ALTER TABLE customer_orders ADD COLUMN referral_discount_amount INTEGER NOT NULL DEFAULT 0`);

console.log(`✓ Referrals schema applied to ${abs}`);
db.close();
