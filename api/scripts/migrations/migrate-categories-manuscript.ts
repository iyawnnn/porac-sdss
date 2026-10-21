import { readFileSync } from 'fs';
import { join } from 'path';
import { sql } from '../db';

// Manuscript revision Phase 2, step 2a (handoff Decisions 6, 9, 13). Runs
// 0035_categories_manuscript.sql and the saved-view category rewrite in one
// transaction, printing the .check.sql counts and the number of saved views
// to rewrite before and after. Safe to run more than once.

// The three renames (Decision 9). The combined "Drainage / Culvert / Manhole
// Issue" is deliberately absent: it was split, not renamed (Decision 6), and
// stays a valid legacy filter, so saved views using it are left unchanged.
export const CATEGORY_RENAMES: Record<string, string> = {
  'Landslide / Slope Failure': 'Rain-Induced Slope Failure/Landslide',
  'Lahar / Debris-Flow Threat': 'Lahar or Volcanic Debris-Flow Threat',
  'Fallen Tree / Storm-Related Obstruction':
    'Fallen Tree or Storm-Related Road Obstruction',
};

// admin_saved_views.query is a serialized querystring, so the category may be
// stored as %20 or + and %2F. URLSearchParams decodes all of them. Returns the
// rewritten query, or null when no category value needs renaming (the row is
// then not touched, so its original encoding is kept). Both surfaces
// ('tickets' and 'flagged') filter by category, so both go through this.
export function renameSavedViewCategories(query: string): string | null {
  const params = new URLSearchParams(query);
  let changed = false;
  const next = new URLSearchParams();
  for (const [key, value] of params) {
    const renamed = key === 'category' ? CATEGORY_RENAMES[value] : undefined;
    if (renamed) changed = true;
    next.append(key, renamed ?? value);
  }
  return changed ? next.toString() : null;
}

// The migration's statements, to run one at a time so each UPDATE's own row
// count can be read: for a multi-statement unsafe() whose statements return
// no rows, postgres.js resolves a single result carrying only one count.
// Whole-line comments are dropped first (the header has ';' in its prose);
// every statement in the file ends with ';' at the end of a line.
export function migrationStatements(migration: string): string[] {
  return migration
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(/;[ \t]*$/m)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

async function savedViewsToRename(
  db: typeof sql,
): Promise<{ id: number; query: string }[]> {
  const rows = await db<{ id: number; query: string }[]>`
    SELECT id, query FROM admin_saved_views ORDER BY id
  `;
  return rows.flatMap((row) => {
    const query = renameSavedViewCategories(row.query);
    return query === null ? [] : [{ id: row.id, query }];
  });
}

async function main() {
  const dir = join(__dirname, '..', '..', 'drizzle');
  const check = readFileSync(
    join(dir, '0035_categories_manuscript.check.sql'),
    'utf8',
  );
  const migration = readFileSync(
    join(dir, '0035_categories_manuscript.sql'),
    'utf8',
  );
  // ALTER, the three renames, the review flag, in that order.
  const statements = migrationStatements(migration);
  if (statements.length !== 5) {
    throw new Error(
      `Expected 5 statements in 0035_categories_manuscript.sql, found ${statements.length}`,
    );
  }

  const [before] = await sql.unsafe(check);
  console.log('Before:', before);
  console.log(
    `Saved views needing a category rename: ${(await savedViewsToRename(sql)).length}`,
  );

  const { ticketRows, savedViews } = await sql.begin(async (tx) => {
    const counts: number[] = [];
    for (const statement of statements) {
      const result = await tx.unsafe(statement);
      counts.push(result.count ?? 0);
    }
    const views = await savedViewsToRename(tx as unknown as typeof sql);
    for (const view of views) {
      await tx`UPDATE admin_saved_views SET query = ${view.query} WHERE id = ${view.id}`;
    }
    return { ticketRows: counts, savedViews: views.length };
  });
  const [, landslide, lahar, fallenTree, review] = ticketRows;
  console.log(
    `Tickets renamed: ${landslide + lahar + fallenTree} (landslide ${landslide}, lahar ${lahar}, fallen tree ${fallenTree}); marked for category review: ${review}`,
  );
  console.log(`Saved views rewritten: ${savedViews}`);

  const [after] = await sql.unsafe(check);
  console.log('After: ', after);
  console.log(
    `Saved views needing a category rename: ${(await savedViewsToRename(sql)).length}`,
  );

  await sql.end();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
