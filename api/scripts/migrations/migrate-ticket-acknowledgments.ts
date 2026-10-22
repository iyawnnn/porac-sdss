import { readFileSync } from 'fs';
import { join } from 'path';
import { sql } from '../db';
import { migrationStatements } from './migrate-ticket-report-fields';

// Manuscript revision Phase 2, step 2d (Appendix H ACKNOWLEDGMENTS). Runs
// 0038_ticket_acknowledgments.sql one statement at a time in ONE
// transaction, printing the .check.sql counts before and after and the rows
// each statement changed. Safe to run more than once. If the guard finds a
// report acknowledgment it can't map to an admin or a ticket, it raises, the
// transaction rolls back and nothing is created.

// One label per statement in 0038_ticket_acknowledgments.sql, in order.
export const STEPS = [
  'guard: admins and tickets of the report acknowledgments',
  'acknowledgments table',
  'backfill the earliest report acknowledgment per ticket',
];

// The second check query reads acknowledgments, so it only runs once the
// table exists (the first query reports acknowledgments_table).
async function printCheck(label: string, checks: string[]) {
  const [summary] = await sql.unsafe(checks[0]);
  console.log(`${label}:`, summary);
  if (summary.acknowledgments_table === true) {
    const [details] = await sql.unsafe(checks[1]);
    console.log(`${label} (acknowledgments):`, details);
  }
}

async function main() {
  const dir = join(__dirname, '..', '..', 'drizzle');
  const checks = migrationStatements(
    readFileSync(join(dir, '0038_ticket_acknowledgments.check.sql'), 'utf8'),
  );
  const statements = migrationStatements(
    readFileSync(join(dir, '0038_ticket_acknowledgments.sql'), 'utf8'),
  );
  if (checks.length !== 2) {
    throw new Error(
      `Expected 2 queries in 0038_ticket_acknowledgments.check.sql, found ${checks.length}`,
    );
  }
  if (statements.length !== STEPS.length) {
    throw new Error(
      `Expected ${STEPS.length} statements in 0038_ticket_acknowledgments.sql, found ${statements.length}`,
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
      `  ${String(i + 1).padStart(2)}. ${step}: ${command === 'INSERT' ? `${count} rows` : 'done'}`,
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
