import { readFileSync } from 'fs';
import { join } from 'path';
import { sql } from '../db';

async function main() {
  const path = join(
    __dirname,
    '..',
    '..',
    'drizzle',
    '0032_report_intake_actions.sql',
  );
  const raw = readFileSync(path, 'utf8');

  await sql.unsafe(raw);
  console.log('report_intake_actions applied.');

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
