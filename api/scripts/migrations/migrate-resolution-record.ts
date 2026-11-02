import { readFileSync } from 'fs';
import { join } from 'path';
import { sql } from '../db';
import { migrationStatements } from './migrate-ticket-report-fields';

// Manuscript revision Phase 5, step 5c (step 1 of 2): the resolution record
// (tickets.resolved_at / resolved_by_admin_id) and the return-to-Under-
// Review history (status_history from_status / reason and the resolution
// snapshot). Runs 0046_resolution_record.sql one statement at a time in ONE
// transaction, printing the .check.sql counts before and after and the rows
// each statement changed. Additive only and nothing is backfilled, so every
// run changes 0 rows; a second run changes nothing.
//
// Stops BEFORE opening the transaction when a non-Resolved ticket already
// has a resolution_outcome (it would break
// tickets_resolution_outcome_status_check), printing the count and the
// first 50 offending tickets. Those rows are never fixed here; correct them
// by hand and run again. Statement 1 of the SQL file makes the same check
// inside the transaction, for anyone applying the file by hand.

// One label per statement in 0046_resolution_record.sql, in order.
export const STEPS = [
  'stop if a non-Resolved ticket already has a resolution_outcome',
  'tickets resolved_at and resolved_by_admin_id (FK)',
  'tickets CHECK rules',
  'status_history from_status, reason and resolution snapshot columns',
  'status_history CHECK rules',
];

// The second check query reads the new columns, so it only runs once they
// all exist (the first query reports new_columns).
interface CheckSummary {
  new_columns: number;
  outcome_on_non_resolved: number;
}

async function printCheck(
  label: string,
  checks: string[],
): Promise<CheckSummary> {
  const [summary] = await sql.unsafe<CheckSummary[]>(checks[0]);
  console.log(`${label}:`, JSON.stringify(summary, null, 2));
  if (summary.new_columns === 7) {
    const [details] = await sql.unsafe(checks[1]);
    console.log(`${label} (new columns):`, JSON.stringify(details, null, 2));
  }
  return summary;
}

async function main() {
  const dir = join(__dirname, '..', '..', 'drizzle');
  const checks = migrationStatements(
    readFileSync(join(dir, '0046_resolution_record.check.sql'), 'utf8'),
  );
  const statements = migrationStatements(
    readFileSync(join(dir, '0046_resolution_record.sql'), 'utf8'),
  );
  if (checks.length !== 2) {
    throw new Error(
      `Expected 2 queries in 0046_resolution_record.check.sql, found ${checks.length}`,
    );
  }
  if (statements.length !== STEPS.length) {
    throw new Error(
      `Expected ${STEPS.length} statements in 0046_resolution_record.sql, found ${statements.length}`,
    );
  }

  const before = await printCheck('Before', checks);
  if (before.outcome_on_non_resolved > 0) {
    console.error(
      `Stopped, nothing changed: ${before.outcome_on_non_resolved} non-Resolved ticket(s) already have a resolution_outcome (see blocking_rows_first_50 above). Nothing is fixed here; correct these rows by hand and run again.`,
    );
    await sql.end();
    process.exit(1);
  }

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
