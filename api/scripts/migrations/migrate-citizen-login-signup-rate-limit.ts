import { readFileSync } from "fs";
import { join } from "path";
import { sql } from "../db";

async function main() {
  const path = join(
    __dirname,
    "..",
    "..",
    "drizzle",
    "0026_citizen_login_signup_rate_limit.sql",
  );
  const raw = readFileSync(path, "utf8");

  await sql.unsafe(raw);
  console.log("citizen_login_rate_limit_events / citizen_signup_rate_limit_events applied.");

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
