// Convierte CSV de Shopify customers a JSON para que el cron en Vercel lo lea.
// Output: data/migration-customers.json (committed al repo, repo privado).
// Uso: node scripts/csv-to-json.js
const fs = require("node:fs");
const path = require("node:path");

const CSV_PATH = process.env.CSV_PATH ||
  "C:\\Users\\Ozymandias\\Downloads\\cutlimeddb\\customers_export.csv";

function parseCSV(text) {
  const rows = [];
  let cur = []; let buf = ""; let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { buf += '"'; i++; }
      else if (c === '"') { inQ = false; }
      else buf += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { cur.push(buf); buf = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        if (cur.length || buf) { cur.push(buf); rows.push(cur); cur = []; buf = ""; }
      } else buf += c;
    }
  }
  if (cur.length || buf) { cur.push(buf); rows.push(cur); }
  return rows;
}

const text = fs.readFileSync(CSV_PATH, "utf8");
const rows = parseCSV(text);
const headers = rows[0].map((h) => h.trim());
const idx = (name) => headers.indexOf(name);

const customers = [];
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  if (!r || r.length < headers.length) continue;
  const email = (r[idx("Email")] || "").trim().toLowerCase();
  if (!email || !email.includes("@")) continue;
  const company = r[idx("Company")] || "";
  const firstName = (r[idx("First Name")] || "").trim();
  if (company && !firstName) continue;
  const note = r[idx("Note")] || "";
  const tags = (r[idx("Tags")] || "").toLowerCase();
  const rutMatch = note.match(/(\d{1,2}[.\-]?\d{3}[.\-]?\d{3}[\-]?[0-9kK])/);
  const rut = rutMatch ? rutMatch[1] : null;
  const isApproved = /\baprobado\b/i.test(tags);
  customers.push({
    email,
    first_name: firstName,
    last_name: (r[idx("Last Name")] || "").trim(),
    phone: (r[idx("Phone")] || "").replace(/^'/, "").replace(/[^\d+]/g, ""),
    rut,
    is_approved: isApproved,
  });
}

const outPath = path.resolve(__dirname, "..", "data", "migration-customers.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(customers, null, 2));
console.log(`✓ ${customers.length} customers → ${outPath}`);
console.log(`  approved: ${customers.filter((c) => c.is_approved).length}`);
console.log(`  pending:  ${customers.filter((c) => !c.is_approved).length}`);
