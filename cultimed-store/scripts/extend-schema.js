// Extend the shared cultisoft.db with storefront-specific tables.
// Idempotent (uses IF NOT EXISTS).
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
-- Customer-facing accounts (separate from staff)
CREATE TABLE IF NOT EXISTS customer_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  rut TEXT,
  phone TEXT,
  patient_id INTEGER REFERENCES patients(id),  -- linked once admin verifies
  prescription_status TEXT NOT NULL DEFAULT 'none', -- none | pending | aprobada | rechazada | expired
  prescription_url TEXT,
  prescription_uploaded_at TEXT,
  prescription_reviewed_by INTEGER REFERENCES staff(id),
  prescription_reviewed_at TEXT,
  prescription_reviewer_notes TEXT,
  age_gate_accepted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Customer orders (distinct flow from internal dispensations)
CREATE TABLE IF NOT EXISTS customer_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  folio TEXT UNIQUE NOT NULL,
  customer_account_id INTEGER NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending_payment',
    -- pending_payment | proof_uploaded | payment_confirmed | preparing | shipped | delivered | cancelled
  subtotal INTEGER NOT NULL,
  total INTEGER NOT NULL,
  shipping_address TEXT,
  shipping_city TEXT,
  shipping_region TEXT,
  shipping_phone TEXT,
  shipping_method TEXT DEFAULT 'pickup', -- pickup | courier
  shipping_tracking TEXT,
  notes TEXT,
  payment_method TEXT DEFAULT 'transfer',
  payment_proof_url TEXT,
  payment_proof_uploaded_at TEXT,
  payment_confirmed_by INTEGER REFERENCES staff(id),
  payment_confirmed_at TEXT,
  payment_rejection_reason TEXT,
  whatsapp_sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Items in each order (linked to product, batch reserved at confirmation)
CREATE TABLE IF NOT EXISTS customer_order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES customer_orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  batch_id INTEGER REFERENCES batches(id),  -- assigned by admin when confirming
  quantity INTEGER NOT NULL,
  unit_price INTEGER NOT NULL,
  total_price INTEGER NOT NULL
);

-- Order status timeline (each transition logged for traceability)
CREATE TABLE IF NOT EXISTS customer_order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES customer_orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  -- created | proof_uploaded | payment_confirmed | payment_rejected | preparing
  -- | shipped | delivered | cancelled | whatsapp_sent
  message TEXT,
  staff_id INTEGER REFERENCES staff(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customer_orders_account ON customer_orders(customer_account_id);
CREATE INDEX IF NOT EXISTS idx_customer_orders_status ON customer_orders(status);
CREATE INDEX IF NOT EXISTS idx_customer_orders_created ON customer_orders(created_at);
CREATE INDEX IF NOT EXISTS idx_customer_order_items_order ON customer_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_customer_order_events_order ON customer_order_events(order_id);
CREATE INDEX IF NOT EXISTS idx_customer_accounts_email ON customer_accounts(email);
`;

db.exec(ddl);
console.log(`✓ Storefront schema extended on ${abs}`);
db.close();
