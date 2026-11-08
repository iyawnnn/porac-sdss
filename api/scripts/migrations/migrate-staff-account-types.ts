import { readFileSync } from 'fs';
import { join } from 'path';
import type { Sql, TransactionSql } from 'postgres';
import { verifyPhase8bFinalState } from './contracted-state';
import { alignAssessmentInTransaction } from './migrate-operational-assessment-alignment';

const migrationStatements = (text: string) =>
  text.split('--> statement-breakpoint');

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
async function printCheck(
  sql: Pick<Sql, 'unsafe'>,
  label: string,
  checks: string[],
) {
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

export async function migrateStaffAccountTypes(sql: Sql) {
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

  const results = await sql.begin(async (tx) => {
    await tx.unsafe("SET LOCAL lock_timeout = '5s'");
    await tx.unsafe("SET LOCAL statement_timeout = '60s'");
    await tx`SELECT pg_advisory_xact_lock(8048,1)`;
    const [state] = await tx<{ canonical: boolean; legacy: number }[]>`
      SELECT bool_or(attname IN ('assessed_conditions','interim_mitigation','deferment_or_referral_reason')) canonical,
        count(*) FILTER (WHERE attname LIKE 'legacy_%')::int legacy
      FROM pg_attribute WHERE attrelid=to_regclass('public.operational_assessments')
        AND attnum>0 AND NOT attisdropped
    `;
    if (state.legacy && !state.canonical) {
      throw new Error('0049 mixed assessment state');
    }
    if (state.canonical) {
      // Full final-state verification only; never replay 0039's historical
      // audit backfill or recreate its retired compatibility objects.
      if (state.legacy !== 4) {
        await verifyPhase8bFinalState(tx);
      } else {
        await alignAssessmentInTransaction(tx);
        const expected = statements[8].match(/AS \$\$([\s\S]*?)\$\$/)?.[1];
        const [compatibility] = await tx<{ valid: boolean }[]>`
          SELECT EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
            JOIN pg_language l ON l.oid=p.prolang
            WHERE t.tgrelid='public.admin_audit_events'::regclass
              AND t.tgname='admin_audit_events_fill_actor_account_type'
              AND t.tgtype=7 AND t.tgenabled='O' AND t.tgnargs=0 AND t.tgqual IS NULL
              AND p.oid=to_regprocedure('public.admin_audit_events_fill_actor_account_type()')
              AND regexp_replace(p.prosrc,'[[:space:]]','','g')=
                regexp_replace(${expected ?? null}::text,'[[:space:]]','','g')
              AND NOT p.prosecdef AND p.proconfig IS NULL
              AND l.lanname='plpgsql') valid
        `;
        if (!compatibility.valid)
          throw new Error('0049 mixed compatibility state');
      }
      await verifyStaffMapping(tx, checks);
      return null;
    }
    await printCheck(tx, 'Before', checks);
    const done: { command: string; count: number }[] = [];
    for (const statement of statements) {
      const result = await tx.unsafe(statement);
      done.push({ command: result.command, count: result.count ?? 0 });
    }
    return done;
  });
  if (!results) return;
  console.log('Rows changed per step:');
  STEPS.forEach((step, i) => {
    const { command, count } = results[i];
    console.log(
      `  ${String(i + 1).padStart(2)}. ${step}: ${command === 'UPDATE' ? `${count} rows` : 'done'}`,
    );
  });

  await printCheck(sql, 'After', checks);
}

async function verifyStaffMapping(tx: TransactionSql, checks: string[]) {
  const [mapping] = await tx.unsafe(checks[1]);
  if (
    [
      'admins_mapping_mismatch',
      'check_rule_violations',
      'focal_not_on_mdrrmo',
      'audit_null_actor_account_type',
    ].some((key) => Number(mapping[key]) !== 0)
  ) {
    throw new Error('0049 contracted staff mapping mismatch');
  }
}

if (require.main === module) {
  void (async () => {
    const { sql } = (await import('../db.js')) as { sql: Sql };
    try {
      await migrateStaffAccountTypes(sql);
    } finally {
      await sql.end();
    }
  })().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
