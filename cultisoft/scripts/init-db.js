// Run schema.sql against the SQLite database. Idempotent.
const Database = require("better-sqlite3");
const fs = require("node:fs");
const path = require("node:path");

const DB_PATH = process.env.DB_PATH || "./data/cultisoft.db";
const SCHEMA_PATH = path.join(__dirname, "..", "lib", "schema.sql");

const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const schema = fs.readFileSync(SCHEMA_PATH, "utf8");
db.exec(schema);

console.log(`✓ Schema applied to ${DB_PATH}`);
db.close();
