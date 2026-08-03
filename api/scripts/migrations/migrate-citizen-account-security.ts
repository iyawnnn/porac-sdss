import { readFileSync } from "fs";
import { join } from "path";
import { sql } from "../db";

async function main() {
  const path = join(__dirname, "..", "..", "drizzle", "0013_citizen_account_security.sql");
  const raw = readFileSync(path, "utf8");

  await sql.unsafe(raw);
  console.log("citizens.password_changed_at + citizen_audit_events applied.");

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
