import { readFileSync } from 'fs';
import { join } from 'path';
import { sql } from '../db';
import { migrationStatements } from './migrate-ticket-report-fields';

// Manuscript revision Phase 5, step 5b (Appendix H OPERATIONAL_ASSESSMENTS
// and WORK_ORDERS). Runs 0045_assessment_work_orders.sql one statement at a
// time in ONE transaction, printing the .check.sql counts before and after
// and the rows each statement changed. Additive only and nothing is
// backfilled, so every run changes 0 rows; a second run changes nothing.
//
// Stops BEFORE opening the transaction when an existing Work Order would
// break work_orders_completed_at_check (completed without completed_at) or
// work_orders_cancelled_not_completed_check (cancelled with completed_at),
// printing the counts and the first 50 offending rows. Those rows are never
// backfilled here; fix them by hand and run again. Statement 1 of the SQL
// file makes the same check inside the transaction, for anyone applying the
// file by hand.

// One label per statement in 0045_assessment_work_orders.sql, in order.
export const STEPS = [
  'stop if an existing Work Order breaks the completed/cancelled rules',
  'work_orders cancellation and replacement columns',
  'work_orders UNIQUE (id, ticket_id)',
  'replacement Work Order on the same ticket (FK)',
  'work_orders CHECK rules',
  'replacement_work_order_id index',
  'operational_assessments actual_action, evidence URL, constraint notes',
  'operational_assessments CHECK rules',
];

// The second check query reads the new columns, so it only runs once they
// all exist (the first query reports new_columns).
interface CheckSummary {
  new_columns: number;
  completed_without_completed_at: number;
  cancelled_with_completed_at: number;
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
    readFileSync(join(dir, '0045_assessment_work_orders.check.sql'), 'utf8'),
  );
  const statements = migrationStatements(
    readFileSync(join(dir, '0045_assessment_work_orders.sql'), 'utf8'),
  );
  if (checks.length !== 2) {
    throw new Error(
      `Expected 2 queries in 0045_assessment_work_orders.check.sql, found ${checks.length}`,
    );
  }
  if (statements.length !== STEPS.length) {
    throw new Error(
      `Expected ${STEPS.length} statements in 0045_assessment_work_orders.sql, found ${statements.length}`,
    );
  }

  const before = await printCheck('Before', checks);
  if (
    before.completed_without_completed_at > 0 ||
    before.cancelled_with_completed_at > 0
  ) {
    console.error(
      `Stopped, nothing changed: ${before.completed_without_completed_at} completed work order(s) without completed_at, ${before.cancelled_with_completed_at} cancelled work order(s) with completed_at (see blocking_rows_first_50 above). Nothing is backfilled; fix these rows by hand and run again.`,
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
