import { readFileSync } from 'fs';
import { join } from 'path';
import type { Sql } from 'postgres';
import { alignAssessmentInTransaction } from './migrate-operational-assessment-alignment';
// Keep this injectable runner free of modules that instantiate a real client.
function migrationStatements(file: string): string[] {
  return file
    .split('--> statement-breakpoint')
    .map((chunk) => chunk.trim())
    .filter((chunk) =>
      chunk
        .split(/\r?\n/)
        .some((line) => line.trim() !== '' && !line.trim().startsWith('--')),
    );
}

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
  sql: Pick<Sql, 'unsafe'>,
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

export async function migrateAssessmentWorkOrders(sql: Sql) {
  return sql.begin(async (tx) => {
    await tx.unsafe("SET LOCAL lock_timeout = '5s'");
    await tx.unsafe("SET LOCAL statement_timeout = '60s'");
    // Share 0048's lock before inspecting names, so a concurrent cutover cannot
    // make this runner recreate a retired column after its initial check.
    await tx`SELECT pg_advisory_xact_lock(8048,1)`;
    const markers =
      await tx`SELECT attname FROM pg_attribute WHERE attrelid='public.operational_assessments'::regclass
      AND attnum>0 AND NOT attisdropped AND (attname='assessed_conditions' OR attname LIKE 'legacy_%')`;
    if (markers.length) {
      await alignAssessmentInTransaction(tx);
      return;
    }
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

    const before = await printCheck(tx, 'Before', checks);
    if (
      before.completed_without_completed_at > 0 ||
      before.cancelled_with_completed_at > 0
    ) {
      console.error(
        `Stopped, nothing changed: ${before.completed_without_completed_at} completed work order(s) without completed_at, ${before.cancelled_with_completed_at} cancelled work order(s) with completed_at (see blocking_rows_first_50 above). Nothing is backfilled; fix these rows by hand and run again.`,
      );
      throw new Error('0045 preflight failed.');
    }

    const results: { command: string; count: number }[] = [];
    for (const statement of statements) {
      const result = await tx.unsafe(statement);
      results.push({ command: result.command, count: result.count ?? 0 });
    }

    console.log('Rows changed per step:');
    STEPS.forEach((step, i) => {
      const { command, count } = results[i];
      console.log(
        `  ${String(i + 1).padStart(2)}. ${step}: ${command === 'UPDATE' || command === 'INSERT' ? `${count} rows` : `0 rows (${command ?? 'done'})`}`,
      );
    });

    await printCheck(tx, 'After', checks);
  });
}

if (require.main === module) {
  void (async () => {
    const { sql } = (await import('../db')) as { sql: Sql };
    try {
      await migrateAssessmentWorkOrders(sql);
    } finally {
      await sql.end();
    }
  })().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
