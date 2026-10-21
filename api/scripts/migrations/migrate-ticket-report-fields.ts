import { readFileSync } from 'fs';
import { join } from 'path';
import { sql } from '../db';

// Manuscript revision Phase 2, step 2b (Appendix H). Runs
// 0036_ticket_report_fields.sql one statement at a time in ONE transaction,
// printing the .check.sql counts before and after, the rows each statement
// changed, and five sample tracking references. Safe to run more than once.

// One label per statement in 0036_ticket_report_fields.sql, in order.
export const STEPS = [
  'resolution_outcome enum',
  'tickets: add initial_assigned_office, resolution_outcome, merged_into_ticket_id',
  'tickets: merged_into_ticket_id foreign key',
  'reports: add tracking_reference, submitted_category',
  'backfill tickets.initial_assigned_office',
  'backfill tickets.resolution_outcome',
  'backfill reports.submitted_category',
  'backfill reports.tracking_reference',
  'reports insert trigger function',
  'reports insert trigger (drop)',
  'reports insert trigger (create)',
  'tickets insert trigger function',
  'tickets insert trigger (drop)',
  'tickets insert trigger (create)',
  'reports: NOT NULL',
  'tickets: NOT NULL',
  'reports_tracking_reference_unique index',
  'tickets_merged_into_ticket_id_idx index',
];

// The .sql files separate statements with Drizzle's statement-breakpoint
// comment, since their DO blocks and trigger functions contain ';' (the
// 0035 script's split on line-ending ';' would cut them apart). Chunks with
// nothing but comments are dropped.
export function migrationStatements(file: string): string[] {
  return file
    .split('--> statement-breakpoint')
    .map((chunk) => chunk.trim())
    .filter((chunk) =>
      chunk
        .split(/\r?\n/)
        .some((line) => line.trim() !== '' && !line.trim().startsWith('--')),
    );
}

// The second check query reads the new columns, so it only runs once all
// five exist (the first query reports them as col_* booleans).
async function printCheck(label: string, checks: string[]) {
  const [summary] = await sql.unsafe(checks[0]);
  console.log(`${label}:`, summary);
  const columnsExist = Object.entries(summary)
    .filter(([key]) => key.startsWith('col_'))
    .every(([, exists]) => exists === true);
  if (columnsExist) {
    const [details] = await sql.unsafe(checks[1]);
    console.log(`${label} (new columns):`, details);
  }
}

async function main() {
  const dir = join(__dirname, '..', '..', 'drizzle');
  const checks = migrationStatements(
    readFileSync(join(dir, '0036_ticket_report_fields.check.sql'), 'utf8'),
  );
  const statements = migrationStatements(
    readFileSync(join(dir, '0036_ticket_report_fields.sql'), 'utf8'),
  );
  if (checks.length !== 2) {
    throw new Error(
      `Expected 2 queries in 0036_ticket_report_fields.check.sql, found ${checks.length}`,
    );
  }
  if (statements.length !== STEPS.length) {
    throw new Error(
      `Expected ${STEPS.length} statements in 0036_ticket_report_fields.sql, found ${statements.length}`,
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

  // Manila time, since that is where the reference's year comes from.
  const samples = await sql<
    { id: number; created_manila: string; tracking_reference: string }[]
  >`
    SELECT id, to_char(created_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD HH24:MI') AS created_manila,
      tracking_reference
    FROM reports ORDER BY id DESC LIMIT 5
  `;
  console.log('Sample tracking references (latest 5):');
  for (const row of samples) {
    console.log(
      `  report ${row.id}, created ${row.created_manila} Manila: ${row.tracking_reference}`,
    );
  }

  await sql.end();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
