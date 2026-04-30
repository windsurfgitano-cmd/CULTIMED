// Crea los buckets de Storage en Supabase usando la service_role.
// Idempotente: si ya existen, no falla.

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;

if (!SERVICE_KEY || !SUPABASE_URL) {
  console.error("✗ Falta SUPABASE_SERVICE_ROLE_KEY o NEXT_PUBLIC_SUPABASE_URL");
  process.exit(1);
}

async function createBucket(name) {
  const url = `${SUPABASE_URL}/storage/v1/bucket`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: name,
      name,
      public: false,
      file_size_limit: 8 * 1024 * 1024,
      allowed_mime_types: ["image/png", "image/jpeg", "image/webp", "application/pdf"],
    }),
  });
  const txt = await res.text();
  if (res.status === 200 || res.status === 201) {
    console.log(`  ✓ ${name} creado`);
  } else if (res.status === 409 || /already exists|duplicate/i.test(txt)) {
    console.log(`  · ${name} ya existe, OK`);
  } else {
    console.log(`  ✗ ${name} → ${res.status} ${txt}`);
  }
}

(async () => {
  console.log(`▶ Supabase: ${SUPABASE_URL}`);
  await createBucket("prescriptions");
  await createBucket("payment-proofs");
  console.log("✓ Buckets listos");
})();
