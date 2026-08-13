import { readFileSync } from "fs";
import { join } from "path";
import { sql } from "../db";

async function main() {
  const path = join(__dirname, "..", "..", "drizzle", "0024_admin_login_throttle.sql");
  const raw = readFileSync(path, "utf8");

  await sql.unsafe(raw);
  console.log("admin_login_rate_limit_events table and indexes applied.");

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
