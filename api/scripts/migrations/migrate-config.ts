import { readFileSync } from "fs";
import { join } from "path";
import { sql } from "../db";

async function main() {
  const path = join(__dirname, "..", "..", "drizzle", "0007_config.sql");
  const raw = readFileSync(path, "utf8");

  await sql.unsafe(raw);
  console.log("config table and cache defaults applied.");

  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
