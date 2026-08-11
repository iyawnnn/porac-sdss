import { readFileSync } from "fs";
import { join } from "path";
import { sql } from "../db";

async function main() {
  const path = join(__dirname, "..", "..", "drizzle", "0022_ticket_disputes.sql");
  const raw = readFileSync(path, "utf8");

  await sql.unsafe(raw);
  console.log("tickets.disputed_at/dispute_reason applied.");

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
