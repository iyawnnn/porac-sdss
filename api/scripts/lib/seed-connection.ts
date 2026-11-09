import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { assertSeedTarget } from './seed-target';

export function openSeedDatabase(
  databaseUrl: string | undefined,
  args: readonly string[],
) {
  assertSeedTarget(databaseUrl, args);
  // Guard succeeds before even constructing the lazy client.
  const client = postgres(databaseUrl!);
  return { client, sql: client, db: drizzle(client) };
}
