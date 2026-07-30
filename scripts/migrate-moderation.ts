import { readFileSync } from "fs";
import { join } from "path";
import { sql } from "../lib/db/raw";

async function main() {
  const path = join(__dirname, "..", "drizzle", "0009_moderation.sql");
  const raw = readFileSync(path, "utf8");

  await sql.unsafe(raw);
  console.log("reports.moderation_status/moderation_note/moderated_at/moderated_by applied.");

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
