import { readFileSync } from 'fs';
import { join } from 'path';
import { sql } from '../db';

// Manuscript revision Phase 1, step 4. Prints the before/after counts from
// the .check.sql query around the UPDATE so the result can be compared
// without opening a SQL console. Safe to run more than once.
async function main() {
  const dir = join(__dirname, '..', '..', 'drizzle');
  const check = readFileSync(
    join(dir, '0034_saved_views_retire_hazard_urgency.check.sql'),
    'utf8',
  );
  const migration = readFileSync(
    join(dir, '0034_saved_views_retire_hazard_urgency.sql'),
    'utf8',
  );

  const [before] = await sql.unsafe(check);
  console.log('Before:', before);

  const result = await sql.unsafe(migration);
  console.log(`Saved views updated: ${result.count}`);

  const [after] = await sql.unsafe(check);
  console.log('After: ', after);

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
