import { readFileSync } from "fs";
import { join } from "path";
import { sql } from "../db";

async function main() {
  const path = join(__dirname, "..", "..", "drizzle", "0019_admin_password_security.sql");
  const raw = readFileSync(path, "utf8");

  await sql.unsafe(raw);
  console.log("admins.password_changed_at / session_valid_after applied.");

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
