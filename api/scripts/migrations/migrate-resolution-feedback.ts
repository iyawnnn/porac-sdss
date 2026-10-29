import { readFileSync } from 'fs';
import { join } from 'path';
import { sql } from '../db';
import { migrationStatements } from './migrate-ticket-report-fields';

// Manuscript revision Phase 3, step 3g (Appendix H RESOLUTION_FEEDBACK).
// Runs 0042_resolution_feedback.sql one statement at a time in ONE
// transaction, printing the .check.sql counts before and after and the rows
// each statement changed. Safe to run more than once: the backfill inserts
// ON CONFLICT DO NOTHING, so a second run inserts 0 rows. If the guard finds
// a disputed ticket with no reason, it raises, the transaction rolls back
// and nothing is created.

// One label per statement in 0042_resolution_feedback.sql, in order.
export const STEPS = [
  'guard: every old dispute to copy has a reason',
  'resolution_feedback_type enum',
  'resolution_feedback table',
  'ticket_id index',
  'citizen_id index',
  'backfill old feedback to the earliest reporter',
];

// The second check query reads resolution_feedback, so it only runs once
// the table exists (the first query reports resolution_feedback_table).
async function printCheck(label: string, checks: string[]) {
  const [summary] = await sql.unsafe(checks[0]);
  console.log(`${label}:`, summary);
  if (summary.resolution_feedback_table === true) {
    const [details] = await sql.unsafe(checks[1]);
    console.log(`${label} (resolution_feedback):`, JSON.stringify(details, null, 2));
  }
}

async function main() {
  const dir = join(__dirname, '..', '..', 'drizzle');
  const checks = migrationStatements(
    readFileSync(join(dir, '0042_resolution_feedback.check.sql'), 'utf8'),
  );
  const statements = migrationStatements(
    readFileSync(join(dir, '0042_resolution_feedback.sql'), 'utf8'),
  );
  if (checks.length !== 2) {
    throw new Error(
      `Expected 2 queries in 0042_resolution_feedback.check.sql, found ${checks.length}`,
    );
  }
  if (statements.length !== STEPS.length) {
    throw new Error(
      `Expected ${STEPS.length} statements in 0042_resolution_feedback.sql, found ${statements.length}`,
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
      `  ${String(i + 1).padStart(2)}. ${step}: ${command === 'INSERT' ? `${count} rows` : `0 rows (${command ?? 'done'})`}`,
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
