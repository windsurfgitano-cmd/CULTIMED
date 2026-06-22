#!/usr/bin/env node
/**
 * QA full check — builds + production smoke + direct DB/API E2E with rollback.
 *
 * Uso:
 *   node scripts/qa-full-check.mjs
 *
 * Requisitos:
 *   - cultimed-store/.env.local con DATABASE_URL + Supabase Storage keys
 *   - cultisoft/.env.local con DATABASE_URL para build/runtime admin local
 *   - node_modules instalados en cultimed-store y cultisoft
 */
import { spawn } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

function run(label, command, cwd = root) {
  return new Promise((resolve, reject) => {
    console.log(`\n=== ${label} ===`);
    console.log(`$ ${command}`);
    const child = spawn(command, {
      cwd,
      shell: true,
      stdio: "inherit",
      env: process.env,
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} failed with exit ${code}`));
    });
    child.on("error", reject);
  });
}

const started = new Date();
try {
  await run("build store", "npm run build", path.join(root, "cultimed-store"));
  await run("build admin", "npm run build", path.join(root, "cultisoft"));
  await run("production smoke", "node scripts/smoke-test.mjs", root);
  await run("direct e2e full flow with rollback", "node scripts/e2e-full-flow-direct.mjs", root);
  console.log(`\n✅ QA FULL CHECK OK (${Math.round((Date.now() - started.getTime()) / 1000)}s)`);
} catch (e) {
  console.error(`\n❌ QA FULL CHECK FAILED: ${e.message}`);
  process.exit(1);
}
