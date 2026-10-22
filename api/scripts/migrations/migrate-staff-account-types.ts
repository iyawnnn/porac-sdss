import { readFileSync } from 'fs';
import { join } from 'path';
import { sql } from '../db';
import { migrationStatements } from './migrate-ticket-report-fields';

// Manuscript revision Phase 2, step 2e (Appendix H ADMINS account_type /
// is_focal, plus admin_audit_events.actor_account_type). Runs
// 0039_staff_account_types.sql one statement at a time in ONE transaction,
// printing the .check.sql counts before and after and the rows each UPDATE
// changed. Safe to run more than once: only the run that maps an account
// logs it out. If the guard finds an admin it can't map cleanly, it raises,
// the transaction rolls back and nothing is changed.

// One label per statement in 0039_staff_account_types.sql, in order.
export const STEPS = [
  'admin_account_type enum',
  'guard: officer/supervisor with no office, focal on MEO, system_admin with an office',
  'admins.account_type and admins.is_focal columns',
  'map unmapped admins and log them out (session_valid_after = now())',
  'admins.account_type and admins.is_focal NOT NULL',
  'admins_account_type_office_focal_check constraint',
  'admin_audit_events.actor_account_type column',
  'fill actor_account_type from actor_role',
  'fill-on-insert trigger function for older code',
  'drop the fill-on-insert trigger, if any',
  'fill-on-insert trigger',
  'admin_audit_events.actor_account_type NOT NULL',
];

// The second check query reads the new columns, so it only runs once all
// three exist (the first query reports them as col_* booleans).
async function printCheck(label: string, checks: string[]) {
  const [summary] = await sql.unsafe(checks[0]);
  console.log(`${label}:`, summary);
  if (
    summary.col_account_type === true &&
    summary.col_is_focal === true &&
    summary.col_actor_account_type === true
  ) {
    const [details] = await sql.unsafe(checks[1]);
    console.log(`${label} (mapping):`, JSON.stringify(details, null, 2));
  }
}

async function main() {
  const dir = join(__dirname, '..', '..', 'drizzle');
  const checks = migrationStatements(
    readFileSync(join(dir, '0039_staff_account_types.check.sql'), 'utf8'),
  );
  const statements = migrationStatements(
    readFileSync(join(dir, '0039_staff_account_types.sql'), 'utf8'),
  );
  if (checks.length !== 2) {
    throw new Error(
      `Expected 2 queries in 0039_staff_account_types.check.sql, found ${checks.length}`,
    );
  }
  if (statements.length !== STEPS.length) {
    throw new Error(
      `Expected ${STEPS.length} statements in 0039_staff_account_types.sql, found ${statements.length}`,
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
      `  ${String(i + 1).padStart(2)}. ${step}: ${command === 'UPDATE' ? `${count} rows` : 'done'}`,
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
