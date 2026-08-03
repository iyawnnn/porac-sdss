import { readFileSync } from "fs";
import { join } from "path";
import { sql } from "../db";

async function main() {
  const path = join(__dirname, "..", "..", "drizzle", "0012_citizen_identities.sql");
  const raw = readFileSync(path, "utf8");

  await sql.unsafe(raw);
  console.log("citizen_identities table + nullable password_hash applied.");

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
