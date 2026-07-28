import { sql } from "../lib/db/raw";

async function main() {
  const rows = await sql`SELECT key, value, computed_at, note FROM config ORDER BY key`;

  for (const row of rows) {
    console.log(`${row.key} = ${row.value}  (computed_at: ${row.computed_at})`);
    console.log(`  ${row.note}`);
  }

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
