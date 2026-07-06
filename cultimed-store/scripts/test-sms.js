// Prueba el relay TextBee: node scripts/test-sms.js +56912345678 "hola desde cultimed"
// Requiere TEXTBEE_API_KEY y TEXTBEE_DEVICE_ID en .env.local (o exportadas).
require("fs").readFileSync(".env.local", "utf8").split(/\r?\n/).forEach((l) => {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
});

const [, , to, ...msgParts] = process.argv;
const message = msgParts.join(" ") || "Prueba de SMS desde Cultimed (TextBee)";
const { TEXTBEE_API_KEY, TEXTBEE_DEVICE_ID } = process.env;
const BASE = process.env.TEXTBEE_BASE_URL || "https://api.textbee.dev/api/v1";

if (!to || !/^\+56\d{9}$/.test(to)) {
  console.error("Uso: node scripts/test-sms.js +569XXXXXXXX [mensaje]");
  process.exit(1);
}
if (!TEXTBEE_API_KEY || !TEXTBEE_DEVICE_ID) {
  console.error("✗ Falta TEXTBEE_API_KEY / TEXTBEE_DEVICE_ID en .env.local");
  process.exit(1);
}

(async () => {
  const res = await fetch(`${BASE}/gateway/devices/${TEXTBEE_DEVICE_ID}/send-sms`, {
    method: "POST",
    headers: { "x-api-key": TEXTBEE_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ recipients: [to], message }),
  });
  const body = await res.text();
  console.log(res.ok ? `✓ HTTP ${res.status}` : `✗ HTTP ${res.status}`, body.slice(0, 500));
  process.exit(res.ok ? 0 : 1);
})().catch((e) => { console.error("✗", e.message); process.exit(1); });
