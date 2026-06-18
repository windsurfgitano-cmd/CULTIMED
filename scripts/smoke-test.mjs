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

async function expectGet(path, base, codes = [200]) {
  const res = await fetch(`${base}${path}`, { redirect: "manual" });
  if (!codes.includes(res.status)) throw new Error(`status ${res.status}`);
}

test("store health", async () => {
  const { res, body } = await fetchJson(`${STORE}/api/health`);
  if (res.status !== 200) throw new Error(`status ${res.status}`);
  if (body.status !== "ok" || body.db !== true) throw new Error(JSON.stringify(body));
  if (body.service !== "cultimed-store") throw new Error(`service=${body.service}`);
});

test("admin health", async () => {
  const { res, body } = await fetchJson(`${ADMIN}/api/health`);
  if (res.status !== 200) throw new Error(`status ${res.status}`);
  if (body.status !== "ok" || body.db !== true) throw new Error(JSON.stringify(body));
  if (body.service !== "cultisoft") throw new Error(`service=${body.service}`);
});

const storePublic = [
  "/",
  "/productos",
  "/ingresar",
  "/registro",
  "/consulta",
  "/carrito",
  "/embajadores",
  "/privacidad",
  "/terminos",
  "/trazabilidad",
  "/derechos-paciente",
  "/compliance",
  "/recuperar",
];
for (const path of storePublic) {
  test(`store GET ${path}`, async () => {
    await expectGet(path, STORE, [200]);
  });
}

const storeAuthGated = ["/checkout", "/mi-cuenta", "/mi-cuenta/pedidos", "/mi-cuenta/recetas"];
for (const path of storeAuthGated) {
  test(`store GET ${path} sin sesión → redirect`, async () => {
    await expectGet(path, STORE, [307, 308]);
  });
}

const adminPublic = ["/login"];
for (const path of adminPublic) {
  test(`admin GET ${path}`, async () => {
    await expectGet(path, ADMIN, [200]);
  });
}

const adminProtected = [
  "/dashboard",
  "/patients",
  "/web-orders",
  "/web-prescriptions",
  "/reports",
  "/inventory",
  "/products",
  "/dispensations",
  "/ambassadors",
];
for (const path of adminProtected) {
  test(`admin GET ${path} sin sesión → redirect`, async () => {
    await expectGet(path, ADMIN, [307, 308]);
  });
}

test("admin search API sin auth → 401", async () => {
  const { res } = await fetchJson(`${ADMIN}/api/search?q=test`);
  if (res.status !== 401) throw new Error(`expected 401, got ${res.status}`);
});

test("admin patients export sin auth → 401", async () => {
  const res = await fetch(`${ADMIN}/api/patients/export`, { redirect: "manual" });
  if (res.status !== 401) throw new Error(`expected 401, got ${res.status}`);
});

test("admin ocr API sin auth → 401", async () => {
  const res = await fetch(`${ADMIN}/api/ocr`, { method: "POST", redirect: "manual" });
  if (res.status !== 401) throw new Error(`expected 401, got ${res.status}`);
});

test("admin ocr/link API sin auth → 401", async () => {
  const res = await fetch(`${ADMIN}/api/ocr/link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    redirect: "manual",
  });
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

test("store checkout API pickup rechazado implícito (solo courier)", async () => {
  const res = await fetch(`${STORE}/api/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      shipping_method: "pickup",
      shipping_address: "x",
      shipping_city: "x",
      shipping_region: "RM",
      shipping_phone: "+56900000000",
      items: [{ productId: 1, quantity: 1, unitPrice: 1000 }],
    }),
    redirect: "manual",
  });
  if (res.status !== 401) throw new Error(`expected 401 (no session), got ${res.status}`);
});

test("store cron stock-low sin token → 401", async () => {
  const res = await fetch(`${STORE}/api/cron/stock-low`, { redirect: "manual" });
  if (res.status !== 401) throw new Error(`expected 401, got ${res.status}`);
});

test("store cron receta-expiry sin token → 401", async () => {
  const res = await fetch(`${STORE}/api/cron/receta-expiry`, { redirect: "manual" });
  if (res.status !== 401) throw new Error(`expected 401, got ${res.status}`);
});

test("store no expone mp-webhook", async () => {
  const res = await fetch(`${STORE}/api/payments/mp-webhook`, { redirect: "manual" });
  if (res.status !== 404) throw new Error(`expected 404, got ${res.status}`);
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