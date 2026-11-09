import { openSeedDatabase } from './seed-connection';

// Seed-only entrypoint. Migration, archive and read-only verify clients stay separate.
export const { client, sql, db } = openSeedDatabase(
  process.env.DATABASE_URL,
  process.argv.slice(2),
);
