import { readFileSync } from 'fs';
import { join } from 'path';
import { sql } from '../db';
import { migrationStatements } from './migrate-ticket-report-fields';

// Manuscript revision Phase 4, step 4c (Appendix H RAINFALL_CONTEXT). Runs
// 0044_rainfall_context.sql one statement at a time in ONE transaction,
// printing the .check.sql counts before and after and the rows each
// statement changed. Safe to run more than once: nothing is backfilled, so
// every run changes 0 rows.

// One label per statement in 0044_rainfall_context.sql, in order.
export const STEPS = [
  'rainfall_context_status enum',
  'rainfall_context table and CHECK rules',
  'one current row per ticket (partial unique index)',
  'ticket_id index',
  'query_geom GiST index',
];

// The second check query reads the new table, so it only runs once it
// exists (the first query reports rainfall_context_table).
async function printCheck(label: string, checks: string[]) {
  const [summary] = await sql.unsafe(checks[0]);
  console.log(`${label}:`, summary);
  if (summary.rainfall_context_table) {
    const [details] = await sql.unsafe(checks[1]);
    console.log(
      `${label} (rainfall_context):`,
      JSON.stringify(details, null, 2),
    );
  }
}

async function main() {
  const dir = join(__dirname, '..', '..', 'drizzle');
  const checks = migrationStatements(
    readFileSync(join(dir, '0044_rainfall_context.check.sql'), 'utf8'),
  );
  const statements = migrationStatements(
    readFileSync(join(dir, '0044_rainfall_context.sql'), 'utf8'),
  );
  if (checks.length !== 2) {
    throw new Error(
      `Expected 2 queries in 0044_rainfall_context.check.sql, found ${checks.length}`,
    );
  }
  if (statements.length !== STEPS.length) {
    throw new Error(
      `Expected ${STEPS.length} statements in 0044_rainfall_context.sql, found ${statements.length}`,
    );
  }

  await printCheck('Before', checks);

  const results = await sql.begin(async (tx) => {
    const done: { command: string; count: number }[] = [];
    for (const statement of statements) {
      const result = await tx.unsafe(statement);
      done.push({ command: result.command, count: result.count ?? 0 });
    }
    return done;
  });
  console.log('Rows changed per step:');
  STEPS.forEach((step, i) => {
    const { command, count } = results[i];
    console.log(
      `  ${String(i + 1).padStart(2)}. ${step}: ${command === 'UPDATE' || command === 'INSERT' ? `${count} rows` : `0 rows (${command ?? 'done'})`}`,
    );
  });

  await printCheck('After', checks);

  await sql.end();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
