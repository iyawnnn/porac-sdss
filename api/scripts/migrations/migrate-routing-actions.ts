import { readFileSync } from 'fs';
import { join } from 'path';
import { sql } from '../db';
import { migrationStatements } from './migrate-ticket-report-fields';

// Manuscript revision Phase 2, step 2c (Appendix H ROUTING_ACTIONS). Runs
// 0037_routing_actions.sql one statement at a time in ONE transaction,
// printing the .check.sql counts before and after and the rows each
// statement changed. Safe to run more than once. If the guard finds source
// rows it can't map to an admin (or with an over-long name, a missing
// ticket or an over-long agency), it raises, the transaction rolls back and
// nothing is created.

// One label per statement in 0037_routing_actions.sql, in order.
export const STEPS = [
  'routing_action_type enum',
  'guard: admins, names, tickets and agencies of the source rows',
  'routing_actions table',
  'routing_actions_ticket_id_created_at_idx index',
  'backfill REASSIGN from office_reassignments',
  'backfill REFER from ticket_referral_noted audit events',
];

// The second check query reads routing_actions, so it only runs once the
// table exists (the first query reports routing_actions_table).
async function printCheck(label: string, checks: string[]) {
  const [summary] = await sql.unsafe(checks[0]);
  console.log(`${label}:`, summary);
  if (summary.routing_actions_table === true) {
    const [details] = await sql.unsafe(checks[1]);
    console.log(`${label} (routing_actions):`, details);
  }
}

async function main() {
  const dir = join(__dirname, '..', '..', 'drizzle');
  const checks = migrationStatements(
    readFileSync(join(dir, '0037_routing_actions.check.sql'), 'utf8'),
  );
  const statements = migrationStatements(
    readFileSync(join(dir, '0037_routing_actions.sql'), 'utf8'),
  );
  if (checks.length !== 2) {
    throw new Error(
      `Expected 2 queries in 0037_routing_actions.check.sql, found ${checks.length}`,
    );
  }
  if (statements.length !== STEPS.length) {
    throw new Error(
      `Expected ${STEPS.length} statements in 0037_routing_actions.sql, found ${statements.length}`,
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
