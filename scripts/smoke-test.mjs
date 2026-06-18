#!/usr/bin/env node
/**
 * Smoke tests — storefront + admin (prod o local).
 * Uso: node scripts/smoke-test.mjs
 * Env: STORE_URL, ADMIN_URL (defaults: prod)
 */
const STORE = process.env.STORE_URL || "https://dispensariocultimed.cl";
const ADMIN = process.env.ADMIN_URL || "https://panel.dispensariocultimed.cl";

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, { ...opts, redirect: "manual" });
  const ct = res.headers.get("content-type") || "";
  let body = null;
  if (ct.includes("application/json")) {
    body = await res.json();
  } else {
    body = await res.text();
  }
  return { res, body };
}

test("store health", async () => {
  const { res, body } = await fetchJson(`${STORE}/api/health`);
  if (res.status !== 200) throw new Error(`status ${res.status}`);
  if (!body.ok || body.db !== true) throw new Error(JSON.stringify(body));
});

test("admin health", async () => {
  const { res, body } = await fetchJson(`${ADMIN}/api/health`);
  if (res.status !== 200) throw new Error(`status ${res.status}`);
  if (!body.ok || body.db !== true) throw new Error(JSON.stringify(body));
});

const storePages = ["/", "/productos", "/ingresar", "/registro", "/consulta"];
for (const path of storePages) {
  test(`store GET ${path}`, async () => {
    const res = await fetch(`${STORE}${path}`, { redirect: "manual" });
    if (res.status !== 200) throw new Error(`status ${res.status}`);
  });
}

const adminPages = ["/login", "/dashboard"];
for (const path of adminPages) {
  test(`admin GET ${path}`, async () => {
    const res = await fetch(`${ADMIN}${path}`, { redirect: "manual" });
    // login=200, dashboard sin sesión redirige a login
    if (![200, 307, 308].includes(res.status)) throw new Error(`status ${res.status}`);
  });
}

test("admin search API sin auth → 401", async () => {
  const { res } = await fetchJson(`${ADMIN}/api/search?q=test`);
  if (res.status !== 401) throw new Error(`expected 401, got ${res.status}`);
});

test("admin patients export sin auth → 401", async () => {
  const { res } = await fetch(`${ADMIN}/api/patients/export`, { redirect: "manual" });
  if (res.status !== 401) throw new Error(`expected 401, got ${res.status}`);
});

test("store checkout API sin auth → 401", async () => {
  const res = await fetch(`${STORE}/api/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: [] }),
    redirect: "manual",
  });
  if (res.status !== 401) throw new Error(`expected 401, got ${res.status}`);
});

let passed = 0;
let failed = 0;

console.log(`\nSmoke tests — Store: ${STORE} | Admin: ${ADMIN}\n`);

for (const t of tests) {
  try {
    await t.fn();
    console.log(`  ✓ ${t.name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${t.name}: ${e.message}`);
    failed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);