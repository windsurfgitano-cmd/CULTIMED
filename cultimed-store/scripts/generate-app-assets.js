// Genera resources/icon.png (1024x1024) y resources/splash.png (2732x2732) para
// @capacitor/assets, a partir del wordmark dorado de Cultimed.
// - Ícono: monograma "C" dorado sobre fondo oscuro de marca (legible a tamaño chico).
// - Splash: wordmark completo centrado sobre el mismo fondo.
// Uso: node scripts/generate-app-assets.js   (cwd = cultimed-store)
const sharp = require("sharp");
const fs = require("node:fs");

const DARK = "#0F1A22";
const GOLD_STOPS = `
  <stop offset="0%" stop-color="#8C6B32"/>
  <stop offset="35%" stop-color="#E8D6A0"/>
  <stop offset="60%" stop-color="#C9A961"/>
  <stop offset="100%" stop-color="#7A5A28"/>`;
const LOGO_URL =
  "https://ibkhvopshhlbvjwrmuzm.supabase.co/storage/v1/object/public/email-assets/cultimed-logo-gold.png";

async function makeIcon() {
  // Monograma "C" en serif, con gradiente dorado, marco fino de esquinas.
  const svg = `<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">${GOLD_STOPS}</linearGradient></defs>
  <rect width="1024" height="1024" fill="${DARK}"/>
  <g stroke="url(#g)" stroke-width="3" opacity="0.5" fill="none">
    <path d="M120 190 L120 120 L190 120"/>
    <path d="M904 190 L904 120 L834 120"/>
    <path d="M120 834 L120 904 L190 904"/>
    <path d="M904 834 L904 904 L834 904"/>
  </g>
  <text x="512" y="512" font-family="Georgia, 'Times New Roman', serif" font-size="620"
        font-weight="500" fill="url(#g)" text-anchor="middle" dominant-baseline="central">C</text>
  <text x="512" y="820" font-family="'Helvetica Neue', Arial, sans-serif" font-size="60"
        letter-spacing="14" fill="url(#g)" text-anchor="middle" opacity="0.85">CULTIMED</text>
</svg>`;
  await sharp(Buffer.from(svg)).png().toFile("resources/icon.png");
  const m = await sharp("resources/icon.png").metadata();
  console.log(`✓ resources/icon.png ${m.width}x${m.height}`);
}

async function makeSplash() {
  const res = await fetch(LOGO_URL);
  if (!res.ok) throw new Error(`logo HTTP ${res.status}`);
  const logo = Buffer.from(await res.arrayBuffer());
  // El logo dorado viene sobre fondo claro/transparente; lo ponemos a ~1180px
  // de ancho, centrado sobre el fondo oscuro (canvas 2732x2732).
  const logoW = 1180;
  const resized = await sharp(logo).resize({ width: logoW, fit: "inside" }).png().toBuffer();
  const lm = await sharp(resized).metadata();
  const bg = await sharp({
    create: { width: 2732, height: 2732, channels: 4, background: DARK },
  }).png().toBuffer();
  await sharp(bg)
    .composite([{ input: resized, top: Math.round((2732 - (lm.height || 400)) / 2), left: Math.round((2732 - logoW) / 2) }])
    .png()
    .toFile("resources/splash.png");
  const m = await sharp("resources/splash.png").metadata();
  console.log(`✓ resources/splash.png ${m.width}x${m.height}`);
}

(async () => {
  if (!fs.existsSync("resources")) fs.mkdirSync("resources");
  await makeIcon();
  await makeSplash();
})().catch((e) => { console.error("✗", e.message); process.exit(1); });
