// Migra imágenes apotecarias generadas (cloudfront temp) → Supabase Storage public bucket
// y actualiza products.image_url por strain_key.
//
// Uso: node scripts/mirror-product-images.js
require("fs").readFileSync(".env.local", "utf8").split(/\r?\n/).forEach((l) => {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
});
const postgres = require("postgres");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "email-assets"; // bucket público existente

// Mapeo strain_key → URL CloudFront generada (job_display de marketing_studio_image)
const STRAIN_IMAGES = {
  "the-hive-bloom-seed-co":
    "https://d8j0ntlcm91z4.cloudfront.net/user_36DXAx8ObIlSmiogQA75DBh7Kfz/hf_20260505_091232_c1e6c9fb-429e-4feb-9fc0-34458d4eb867.png",
  "bourbon-street-lit-farms":
    "https://d8j0ntlcm91z4.cloudfront.net/user_36DXAx8ObIlSmiogQA75DBh7Kfz/hf_20260505_091238_646e4220-a1ae-4d3a-b86b-0d513c282e2a.png",
  "dulce-de-fresa-bloom-seed-co":
    "https://d8j0ntlcm91z4.cloudfront.net/user_36DXAx8ObIlSmiogQA75DBh7Kfz/hf_20260505_091243_53fa0882-7207-4d30-ab06-cf61e0aec256.png",
  "predispensado-cereal-milk-cookies-powerzzz-genetics":
    "https://d8j0ntlcm91z4.cloudfront.net/user_36DXAx8ObIlSmiogQA75DBh7Kfz/hf_20260505_091248_e70e7188-7c47-48f6-bfb8-75f8c3fc76d2.png",
  "wedding-cake-ndica-dominante---litfarms":
    "https://d8j0ntlcm91z4.cloudfront.net/user_36DXAx8ObIlSmiogQA75DBh7Kfz/hf_20260505_091258_ed0e8924-3aad-488b-a8c3-5f12f4665b55.png",
  "gaslight-purple-ghost-sativa-dominante-lit-farm":
    "https://d8j0ntlcm91z4.cloudfront.net/user_36DXAx8ObIlSmiogQA75DBh7Kfz/hf_20260505_091302_3e756d7a-92ca-4527-997f-7339ef43193b.png",
  "aceite-sublingual-calma":
    "https://d8j0ntlcm91z4.cloudfront.net/user_36DXAx8ObIlSmiogQA75DBh7Kfz/hf_20260505_091308_47ca40f7-d544-47e9-85e1-c6da367656e8.png",
};

async function uploadOne(strainKey, srcUrl) {
  // Download
  const res = await fetch(srcUrl);
  if (!res.ok) throw new Error(`download ${srcUrl} → ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  console.log(`  ↓ ${strainKey} (${(buf.length / 1024).toFixed(0)}KB)`);

  // Upload to Supabase Storage (overwrite if exists)
  const path = `products/${strainKey}.png`;
  const upRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "image/png",
      "x-upsert": "true",
    },
    body: buf,
  });
  if (!upRes.ok) {
    const err = await upRes.text();
    throw new Error(`upload ${path} → ${upRes.status}: ${err}`);
  }
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
  console.log(`  ↑ ${publicUrl}`);
  return publicUrl;
}

(async () => {
  const sql = postgres(process.env.DATABASE_URL, { prepare: false, ssl: "require", max: 1 });
  console.log("Mirror product images → Supabase Storage\n");

  for (const [key, src] of Object.entries(STRAIN_IMAGES)) {
    try {
      const publicUrl = await uploadOne(key, src);
      const updated = await sql`UPDATE products SET image_url = ${publicUrl} WHERE strain_key = ${key} RETURNING id, name`;
      console.log(`  ✓ DB updated: ${updated.length} rows for "${key}"`);
      updated.forEach((r) => console.log(`     id=${r.id} ${r.name}`));
      console.log("");
    } catch (e) {
      console.error(`  ✗ ${key}: ${e.message}\n`);
    }
  }

  await sql.end();
  console.log("Done.");
})().catch((e) => { console.error(e.message); process.exit(1); });
