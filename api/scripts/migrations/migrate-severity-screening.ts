import { readFileSync } from 'fs';
import { join } from 'path';
import { sql } from '../db';
import { migrationStatements } from './migrate-ticket-report-fields';

// Manuscript revision Phase 3, step 3f (Appendix H REPORTS
// severity_screening_* fields). Runs 0041_severity_screening.sql one
// statement at a time in ONE transaction, printing the .check.sql counts
// before and after and the rows each statement changed. Safe to run more
// than once: nothing is backfilled, so every run changes 0 rows.

// One label per statement in 0041_severity_screening.sql, in order.
export const STEPS = [
  'severity_screening_status enum',
  'reports severity screening columns',
  'consistency CHECK rule',
];

// The second check query reads the new columns, so it only runs once they
// all exist (the first query reports screening_columns).
async function printCheck(label: string, checks: string[]) {
  const [summary] = await sql.unsafe(checks[0]);
  console.log(`${label}:`, summary);
  if (summary.screening_columns === 4) {
    const [details] = await sql.unsafe(checks[1]);
    console.log(`${label} (screening):`, JSON.stringify(details, null, 2));
  }
}

async function main() {
  const dir = join(__dirname, '..', '..', 'drizzle');
  const checks = migrationStatements(
    readFileSync(join(dir, '0041_severity_screening.check.sql'), 'utf8'),
  );
  const statements = migrationStatements(
    readFileSync(join(dir, '0041_severity_screening.sql'), 'utf8'),
  );
  if (checks.length !== 2) {
    throw new Error(
      `Expected 2 queries in 0041_severity_screening.check.sql, found ${checks.length}`,
    );
  }
  if (statements.length !== STEPS.length) {
    throw new Error(
      `Expected ${STEPS.length} statements in 0041_severity_screening.sql, found ${statements.length}`,
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
