import { sql, db } from '../lib/seed-db';
import { localDemoMedia } from '../lib/demo-cli';
import { parseBulkOptions, runBulkDemo } from '../lib/bulk-demo';

async function main() {
  const options = parseBulkOptions(process.argv.slice(2));
  console.log(
    'Bulk submissions share the real 20/hour/IP limit. Do not run the demo and full Playwright within the same hour.',
  );
  console.log(
    JSON.stringify(
      await runBulkDemo(sql, db, localDemoMedia(), options),
      null,
      2,
    ),
  );
}
void main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Bulk seed failed.');
    process.exitCode = 1;
  })
  .finally(() => sql.end());
