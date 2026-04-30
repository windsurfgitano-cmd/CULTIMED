const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const DB_PATH = process.env.DB_PATH || "./data/cultisoft.db";

function rmIfExists(p) {
  if (fs.existsSync(p)) {
    fs.rmSync(p);
    console.log(`× Removed ${p}`);
  }
}

const abs = path.isAbsolute(DB_PATH) ? DB_PATH : path.join(process.cwd(), DB_PATH);
rmIfExists(abs);
rmIfExists(`${abs}-journal`);
rmIfExists(`${abs}-shm`);
rmIfExists(`${abs}-wal`);

execSync("node scripts/init-db.js", { stdio: "inherit" });
execSync("node scripts/seed.js", { stdio: "inherit" });

console.log("✓ Database reset complete.");
