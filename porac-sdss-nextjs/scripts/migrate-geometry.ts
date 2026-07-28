import { readFileSync } from "fs";
import { join } from "path";
import { sql } from "../lib/db/raw";

async function main() {
  const path = join(__dirname, "..", "drizzle", "0001_geometry.sql");
  const raw = readFileSync(path, "utf8");

  await sql.unsafe(raw);
  console.log("Geometry columns and indexes applied.");

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
