const postgres = require("postgres");

const REGIONS = [
  "sa-east-1", "us-east-1", "us-east-2", "us-west-1", "us-west-2",
  "eu-west-1", "eu-west-2", "eu-central-1", "ca-central-1",
  "ap-southeast-1", "ap-southeast-2", "ap-northeast-1", "ap-northeast-2", "ap-south-1"
];

const PWD = "Dinero123123.!!!";
const REF = "ibkhvopshhlbvjwrmuzm";

(async () => {
  for (const r of REGIONS) {
    const url = `postgres://postgres.${REF}:${PWD}@aws-0-${r}.pooler.supabase.com:6543/postgres`;
    const sql = postgres(url, { max: 1, ssl: "require", prepare: false, connect_timeout: 8 });
    try {
      const [row] = await sql`SELECT current_database() as db`;
      console.log(`\n✓✓✓ ${r}: CONECTADO! db=${row.db}`);
      console.log(`URL: postgres://postgres.${REF}:[PWD]@aws-0-${r}.pooler.supabase.com:6543/postgres`);
      await sql.end();
      process.exit(0);
    } catch (e) {
      console.log(`✗ ${r}: ${e.message.slice(0, 60)}`);
      try { await sql.end(); } catch {}
    }
  }
  console.log("\n✗✗✗ NINGUNA región funcionó.");
  process.exit(1);
})();
