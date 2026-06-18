// Schema extension para método de pago (transferencia con 10% off).
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

safeAlter(`ALTER TABLE customer_orders ADD COLUMN payment_discount_amount INTEGER NOT NULL DEFAULT 0`);

console.log(`✓ Payments schema applied to ${abs}`);
db.close();