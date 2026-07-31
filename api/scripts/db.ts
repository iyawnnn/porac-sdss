import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

// Standalone client for one-time migration/seed/verify scripts — these run
// outside the Nest process via tsx, not through DbModule's DI-managed PG
// client, so they get their own postgres.js instance here.
export const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client);
export { client as sql };
