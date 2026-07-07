// Genera public/og.png (1200x630) para Open Graph / preview de WhatsApp.
// One-off reproducible: fondo oscuro de marca + logo dorado + tagline.
// Uso: node scripts/generate-og.js
const sharp = require("sharp");

const LOGO_URL =
  "https://ibkhvopshhlbvjwrmuzm.supabase.co/storage/v1/object/public/email-assets/cultimed-logo-gold.png";

(async () => {
  const res = await fetch(LOGO_URL);
  if (!res.ok) throw new Error(`logo HTTP ${res.status}`);
  const logo = Buffer.from(await res.arrayBuffer());
  const logoResized = await sharp(logo).resize({ width: 460, fit: "inside" }).png().toBuffer();
  const logoMeta = await sharp(logoResized).metadata();

  const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#0F1A22"/>
  <rect x="40" y="40" width="1120" height="550" fill="none" stroke="#C9B891" stroke-width="1" opacity="0.35"/>
  <text x="600" y="468" font-family="Georgia, serif" font-size="34" fill="#F7F1E5" text-anchor="middle" opacity="0.92">Dispensario m&#233;dico autorizado &#183; Chile</text>
  <text x="600" y="522" font-family="Georgia, serif" font-size="19" fill="#C9B891" text-anchor="middle" letter-spacing="6" opacity="0.8">CANNABIS MEDICINAL &#183; LEY 20.850</text>
</svg>`;

  const top = Math.round((400 - (logoMeta.height || 200)) / 2) + 40;
  const left = Math.round((1200 - (logoMeta.width || 460)) / 2);

  await sharp(Buffer.from(svg))
    .composite([{ input: logoResized, top, left }])
    .png()
    .toFile("public/og.png");

  const out = await sharp("public/og.png").metadata();
  console.log(`✓ public/og.png ${out.width}x${out.height}`);
})().catch((e) => { console.error("✗", e.message); process.exit(1); });
