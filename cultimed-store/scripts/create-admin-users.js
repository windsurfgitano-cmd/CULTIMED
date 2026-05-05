// Crea/upsert 4 admins QF en cultisoft (tabla staff o User)
require("node:fs").readFileSync(".env.local", "utf8").split(/\r?\n/).forEach((line) => {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
});
const postgres = require("postgres");
const bcrypt = require("bcryptjs");

const ADMINS = [
  { email: "angelo.munoz.saez@gmail.com", name: "Angelo Muñoz Sáez" },
  { email: "rincondeoz@gmail.com", name: "Oscar Rincón" },
  { email: "cadiazsa@gmail.com", name: "C. Diaz" },
  { email: "lrojasmelelli@gmail.com", name: "L. Rojas Melelli" },
];
const PASSWORD = "LEOWEKO";
const ROLE = "qf_admin";

(async () => {
  const sql = postgres(process.env.DATABASE_URL, { prepare: false, ssl: "require", max: 1 });

  // Mira los staff existentes para entender el patrón
  const existing = await sql`SELECT id, email, full_name, role FROM staff ORDER BY id LIMIT 10`;
  console.log("existing staff:");
  existing.forEach((s) => console.log(`  id=${s.id} ${s.email} | ${s.full_name} | role=${s.role}`));

  // Distinct roles vigentes
  const roles = await sql`SELECT DISTINCT role FROM staff`;
  console.log("\nroles existentes:", roles.map((r) => r.role).join(", "));

  // Hash bcrypt
  const hash = await bcrypt.hash(PASSWORD, 10);

  // Upsert
  for (const a of ADMINS) {
    const exists = await sql`SELECT id FROM staff WHERE email = ${a.email}`;
    if (exists.length > 0) {
      await sql`UPDATE staff SET password_hash = ${hash}, full_name = ${a.name}, role = ${ROLE}, is_active = 1 WHERE email = ${a.email}`;
      console.log(`  ↻ ${a.email} (id=${exists[0].id}) — password reset + role=${ROLE}`);
    } else {
      const created = await sql`
        INSERT INTO staff (email, password_hash, full_name, role, is_active)
        VALUES (${a.email}, ${hash}, ${a.name}, ${ROLE}, 1)
        RETURNING id
      `;
      console.log(`  + ${a.email} (id=${created[0].id}) — created with role=${ROLE}`);
    }
  }

  await sql.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
