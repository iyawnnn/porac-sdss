import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, client } from "../db";

async function main() {
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Non-spatial migrations applied.");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
