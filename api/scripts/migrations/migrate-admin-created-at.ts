import { readFileSync } from "fs";
import { join } from "path";
import { sql } from "../db";

async function main() {
  const path = join(__dirname, "..", "..", "drizzle", "0017_admin_created_at.sql");
  const raw = readFileSync(path, "utf8");

  await sql.unsafe(raw);
  console.log("admins.created_at applied.");

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
