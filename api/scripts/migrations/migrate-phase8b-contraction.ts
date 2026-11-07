import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Sql } from 'postgres';
import { CONTRACTION_SQL } from './contracted-state';

const check = readFileSync(
  join(__dirname, '../../drizzle/0049_phase8b_contraction.check.sql'),
  'utf8',
);

export async function migratePhase8bContraction(sql: Sql) {
  return sql.begin(async (tx) => {
    await tx.unsafe("SET LOCAL lock_timeout = '5s'");
    await tx.unsafe("SET LOCAL statement_timeout = '60s'");
    console.log('0049 before:', JSON.stringify((await tx.unsafe(check))[0]));
    // SQL owns the lock order, bounded timeouts, preflight, drops and final
    // verification. Notices contain counts/keys only, never removed values.
    await tx.unsafe(CONTRACTION_SQL);
    console.log('0049 after:', JSON.stringify((await tx.unsafe(check))[0]));
  });
}

if (require.main === module) {
  void (async () => {
    const { sql } = (await import('../db.js')) as { sql: Sql };
    try {
      await migratePhase8bContraction(sql);
    } finally {
      await sql.end();
    }
  })().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
