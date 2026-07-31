import { readFileSync } from "fs";
import { join } from "path";
import { sql } from "../db";

async function main() {
  const path = join(__dirname, "..", "..", "drizzle", "0008_exif_data.sql");
  const raw = readFileSync(path, "utf8");

  await sql.unsafe(raw);
  console.log("reports.exif_data applied.");

  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
