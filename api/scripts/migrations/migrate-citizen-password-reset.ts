import { readFileSync } from "fs";
import { join } from "path";
import { sql } from "../db";

async function main() {
  const path = join(__dirname, "..", "..", "drizzle", "0014_citizen_password_reset.sql");
  const raw = readFileSync(path, "utf8");

  await sql.unsafe(raw);
  console.log("citizens.session_valid_after + password_reset_tokens + password_reset_rate_limit_events applied.");

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
