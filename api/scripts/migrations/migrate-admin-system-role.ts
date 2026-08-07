import { readFileSync } from "fs";
import { join } from "path";
import { sql } from "../db";

async function main() {
  const path = join(__dirname, "..", "..", "drizzle", "0016_admin_system_role.sql");
  const raw = readFileSync(path, "utf8");

  await sql.unsafe(raw);
  console.log("admin_role.system_admin + admins.office (nullable) applied.");

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
