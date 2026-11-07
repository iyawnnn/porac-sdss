import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Sql, TransactionSql } from 'postgres';

const directory = join(__dirname, '../../drizzle');
export const ALIGNMENT_SQL = readFileSync(
  join(directory, '0048_operational_assessment_alignment.sql'),
  'utf8',
);
const check = readFileSync(
  join(directory, '0048_operational_assessment_alignment.check.sql'),
  'utf8',
);

// Importing this runner never creates a database client. PGlite uses this same
// transaction entry point with its own injected connection, without any env file.
export async function alignAssessmentInTransaction(tx: TransactionSql) {
  await tx.unsafe("SET LOCAL lock_timeout = '5s'");
  await tx.unsafe("SET LOCAL statement_timeout = '60s'");
  const before = await tx.unsafe(check);
  console.log('0048 before:', JSON.stringify(before[0]));
  for (const statement of ALIGNMENT_SQL.split('--> statement-breakpoint')) {
    if (statement.trim()) await tx.unsafe(statement);
  }
  const result = (await tx.unsafe(check))[0];
  console.log('0048 after:', JSON.stringify(result));
  return result;
}

export async function migrateAssessmentAlignment(sql: Sql) {
  return sql.begin((tx) => alignAssessmentInTransaction(tx));
}

if (require.main === module) {
  void (async () => {
    const { sql } = (await import('../db')) as { sql: Sql };
    try {
      await migrateAssessmentAlignment(sql);
    } finally {
      await sql.end();
    }
  })().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
