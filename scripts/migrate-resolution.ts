import { readFileSync } from "fs";
import { join } from "path";
import { sql } from "../lib/db/raw";

async function main() {
  const path = join(__dirname, "..", "drizzle", "0010_resolution.sql");
  const raw = readFileSync(path, "utf8");

  await sql.unsafe(raw);
  console.log("tickets.resolution_image_url/resolution_notes applied.");

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
