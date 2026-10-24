import { readFileSync } from 'fs';
import { join } from 'path';
import { sql } from '../db';
import { migrationStatements } from './migrate-ticket-report-fields';

// Manuscript revision Phase 3, step 3b (evidence-integrity flags, manuscript
// pp. 42–43). Runs 0040_evidence_flags.sql one statement at a time and the
// saved-view flag rewrite in ONE transaction, printing the .check.sql counts
// before and after, the rows each statement changed, and every saved view it
// rewrites. Safe to run more than once: a second run changes 0 rows.

// One label per statement in 0040_evidence_flags.sql, in order.
export const STEPS = ['recompute the managed evidence flags on reports'];

// admin_saved_views.query is a serialized querystring; URLSearchParams
// decodes it the same way the address bar does (as 0035 does for
// categories). flag=STALE_PHOTO becomes flag=STALE_EVIDENCE; a flag=NO_EXIF
// filter is dropped, since no new code means "photo without GPS". Returns
// the rewritten query, or null when nothing changes (the row is then not
// touched, so its original encoding is kept). Applied to both surfaces;
// only the Flagged Reports surface has a flag filter.
export function rewriteSavedViewFlags(query: string): string | null {
  const params = new URLSearchParams(query);
  let changed = false;
  const next = new URLSearchParams();
  for (const [key, value] of params) {
    if (key === 'flag' && value === 'NO_EXIF') {
      changed = true;
      continue;
    }
    if (key === 'flag' && value === 'STALE_PHOTO') {
      changed = true;
      next.append(key, 'STALE_EVIDENCE');
      continue;
    }
    next.append(key, value);
  }
  return changed ? next.toString() : null;
}

async function savedViewsToRewrite(db: typeof sql) {
  const rows = await db<{ id: number; surface: string; query: string }[]>`
    SELECT id, surface, query FROM admin_saved_views ORDER BY id
  `;
  return rows.flatMap((row) => {
    const query = rewriteSavedViewFlags(row.query);
    return query === null ? [] : [{ ...row, newQuery: query }];
  });
}

async function printCheck(label: string, checks: string[]) {
  const [state] = await sql.unsafe(checks[0]);
  console.log(`${label} (flags now):`, JSON.stringify(state, null, 2));
  const [pending] = await sql.unsafe(checks[1]);
  console.log(`${label} (still to change):`, JSON.stringify(pending, null, 2));
  console.log(
    `${label}: saved views needing a flag rewrite: ${(await savedViewsToRewrite(sql)).length}`,
  );
}

async function main() {
  const dir = join(__dirname, '..', '..', 'drizzle');
  const checks = migrationStatements(
    readFileSync(join(dir, '0040_evidence_flags.check.sql'), 'utf8'),
  );
  const statements = migrationStatements(
    readFileSync(join(dir, '0040_evidence_flags.sql'), 'utf8'),
  );
  if (checks.length !== 2) {
    throw new Error(
      `Expected 2 queries in 0040_evidence_flags.check.sql, found ${checks.length}`,
    );
  }
  if (statements.length !== STEPS.length) {
    throw new Error(
      `Expected ${STEPS.length} statements in 0040_evidence_flags.sql, found ${statements.length}`,
    );
  }

  await printCheck('Before', checks);

  const { results, views } = await sql.begin(async (tx) => {
    const done: { command: string; count: number }[] = [];
    for (const statement of statements) {
      const result = await tx.unsafe(statement);
      done.push({ command: result.command, count: result.count ?? 0 });
    }
    const rewrites = await savedViewsToRewrite(tx as unknown as typeof sql);
    for (const view of rewrites) {
      await tx`UPDATE admin_saved_views SET query = ${view.newQuery} WHERE id = ${view.id}`;
    }
    return { results: done, views: rewrites };
  });
  console.log('Rows changed per step:');
  STEPS.forEach((step, i) => {
    const { command, count } = results[i];
    console.log(
      `  ${String(i + 1).padStart(2)}. ${step}: ${command === 'UPDATE' ? `${count} rows` : 'done'}`,
    );
  });
  console.log(`Saved views rewritten: ${views.length}`);
  for (const view of views) {
    console.log(
      `  #${view.id} (${view.surface}): ${view.query} -> ${view.newQuery}`,
    );
  }

  await printCheck('After', checks);

  await sql.end();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
