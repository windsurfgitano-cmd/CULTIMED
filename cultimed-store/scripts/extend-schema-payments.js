// Schema extension para método de pago (transferencia con 10% off / MercadoPago).
// Idempotente.
const Database = require("better-sqlite3");
const path = require("node:path");
const fs = require("node:fs");

const DB_PATH = process.env.DB_PATH || "../cultisoft/data/cultisoft.db";
const abs = path.isAbsolute(DB_PATH) ? DB_PATH : path.resolve(process.cwd(), DB_PATH);

if (!fs.existsSync(abs)) {
  console.error(`✗ DB not found: ${abs}`);
  process.exit(1);
}

const db = new Database(abs);
db.pragma("foreign_keys = ON");

function safeAlter(sql) {
  try {
    db.exec(sql);
    console.log(`  + ${sql}`);
  } catch (e) {
    if (String(e.message).includes("duplicate column")) {
      // ok
    } else {
      throw e;
    }
  }
}

// Agregamos columnas para tracking del descuento por método de pago + IDs de MercadoPago.
safeAlter(`ALTER TABLE customer_orders ADD COLUMN payment_discount_amount INTEGER NOT NULL DEFAULT 0`);
safeAlter(`ALTER TABLE customer_orders ADD COLUMN mp_preference_id TEXT`);
safeAlter(`ALTER TABLE customer_orders ADD COLUMN mp_payment_id TEXT`);
safeAlter(`ALTER TABLE customer_orders ADD COLUMN mp_status TEXT`);
// init_point lo guardamos para reusar el link de pago si el usuario abandona y vuelve
safeAlter(`ALTER TABLE customer_orders ADD COLUMN mp_init_point TEXT`);

console.log(`✓ Payments schema applied to ${abs}`);
db.close();
