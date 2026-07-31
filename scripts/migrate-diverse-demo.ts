import { readFileSync } from "fs";
import { join } from "path";
import { sql } from "../lib/db/raw";

async function main() {
  const path = join(__dirname, "..", "drizzle", "0011_ticket_rejected_flagged.sql");
  const raw = readFileSync(path, "utf8");

  await sql.unsafe(raw);
  console.log("ticket_status.Rejected and tickets.flagged applied.");

  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
