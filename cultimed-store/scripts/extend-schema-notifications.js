require("fs").readFileSync(".env.local", "utf8").split(/\r?\n/).forEach((l) => {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
});
const postgres = require("postgres");

(async () => {
  const sql = postgres(process.env.DATABASE_URL, { prepare: false, ssl: "require", max: 1 });

  await sql`
    CREATE TABLE IF NOT EXISTS notification_log (
      id serial PRIMARY KEY,
      customer_account_id int REFERENCES customer_accounts(id),
      type text NOT NULL,
      channel text NOT NULL DEFAULT 'email',
      recipient text NOT NULL,
      dedupe_key text NOT NULL,
      related_id int,
      status text NOT NULL,
      error text,
      created_at timestamptz DEFAULT now(),
      UNIQUE (type, channel, dedupe_key)
    )`;
  await sql`ALTER TABLE customer_accounts ADD COLUMN IF NOT EXISTS marketing_opt_out boolean NOT NULL DEFAULT false`;

  const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='notification_log' ORDER BY ordinal_position`;
  console.log("✓ notification_log:", cols.map((c) => c.column_name).join(","));
  const opt = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='customer_accounts' AND column_name='marketing_opt_out'`;
  console.log(opt.length ? "✓ marketing_opt_out presente" : "✗ FALTA marketing_opt_out");
  await sql.end();
})().catch((e) => { console.error("✗", e.message); process.exit(1); });
