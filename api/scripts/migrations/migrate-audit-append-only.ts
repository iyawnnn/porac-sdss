import { readFileSync } from 'fs';
import { join } from 'path';
import { sql } from '../db';
import { migrationStatements } from './migrate-ticket-report-fields';

// Phase 7, step 7b-1. Runs 0047 one statement at a time in ONE transaction,
// printing both .check.sql queries before/after (query 2 only when the new
// column exists) and rows changed per step, just like 0045/0046.
// No backfill or row mutation. Compare total/fingerprint before and after;
// on first apply all existing actor_is_focal values must be NULL.
export const STEPS = [
  'admin_audit_events nullable actor_is_focal (no default)',
  'append-only UPDATE/DELETE rejection function',
  'append-only trigger (drop)',
  'append-only trigger (create)',
];

interface CheckSummary {
  new_columns: number;
}

async function printCheck(label: string, checks: string[]) {
  const [summary] = await sql.unsafe<CheckSummary[]>(checks[0]);
  console.log(`${label}:`, JSON.stringify(summary, null, 2));
  if (summary.new_columns === 1) {
    const [details] = await sql.unsafe(checks[1]);
    console.log(`${label} (new columns):`, JSON.stringify(details, null, 2));
  }
}

async function main() {
  const dir = join(__dirname, '..', '..', 'drizzle');
  const checks = migrationStatements(
    readFileSync(join(dir, '0047_audit_append_only.check.sql'), 'utf8'),
  );
  const statements = migrationStatements(
    readFileSync(join(dir, '0047_audit_append_only.sql'), 'utf8'),
  );
  if (checks.length !== 2) {
    throw new Error(
      `Expected 2 queries in 0047_audit_append_only.check.sql, found ${checks.length}`,
    );
  }
  if (statements.length !== STEPS.length) {
    throw new Error(
      `Expected ${STEPS.length} statements in 0047_audit_append_only.sql, found ${statements.length}`,
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
