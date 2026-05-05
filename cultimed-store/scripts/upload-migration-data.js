// Sube data/migration-customers.json a Supabase Storage en bucket privado.
// El endpoint /api/cron/migrate-shopify lo fetch en runtime con SUPABASE_SERVICE_ROLE_KEY.
require("node:fs").readFileSync(".env.local", "utf8").split(/\r?\n/).forEach((line) => {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
});

const fs = require("node:fs");
const path = require("node:path");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "migrations"; // privado

async function ensureBucket() {
  // Lista buckets, crea si no existe
  const list = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
  });
  const buckets = await list.json();
  const has = buckets.find?.((b) => b.name === BUCKET);
  if (has) {
    console.log(`✓ Bucket "${BUCKET}" exists (public=${has.public})`);
    return;
  }
  const create = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }),
  });
  if (!create.ok) {
    const err = await create.text();
    throw new Error(`bucket create: ${create.status} ${err}`);
  }
  console.log(`✓ Bucket "${BUCKET}" created (private)`);
}

async function upload() {
  const filePath = path.resolve(__dirname, "..", "data", "migration-customers.json");
  const buf = fs.readFileSync(filePath);
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/customers.json`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
      "Content-Type": "application/json",
      "x-upsert": "true",
    },
    body: buf,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`upload: ${res.status} ${err}`);
  }
  console.log(`✓ Uploaded ${(buf.length / 1024).toFixed(1)}KB → ${BUCKET}/customers.json`);
}

(async () => {
  await ensureBucket();
  await upload();
  console.log("Done.");
})().catch((e) => { console.error(e.message); process.exit(1); });
