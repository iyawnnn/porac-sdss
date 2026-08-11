import { readFileSync } from "fs";
import { join } from "path";
import { sql } from "../db";

async function main() {
  const path = join(__dirname, "..", "..", "drizzle", "0023_ticket_resolution_confirmation.sql");
  const raw = readFileSync(path, "utf8");

  await sql.unsafe(raw);
  console.log("tickets.resolution_confirmed_at applied.");

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
