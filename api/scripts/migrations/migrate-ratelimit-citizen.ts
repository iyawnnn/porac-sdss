import { readFileSync } from "fs";
import { join } from "path";
import { sql } from "../db";

async function main() {
  const path = join(__dirname, "..", "..", "drizzle", "0005_ratelimit_citizen.sql");
  const raw = readFileSync(path, "utf8");

  await sql.unsafe(raw);
  console.log("rate_limit_events.citizen_id column applied.");

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
