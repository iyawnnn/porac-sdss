import { sql, db } from '../lib/seed-db';
import { runDemoSeed } from '../lib/demo-cli';

// Compatibility entrypoint: one current scenario demo, no destructive reset.
void runDemoSeed(sql, db)
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Demo failed.');
    process.exitCode = 1;
  })
  .finally(() => sql.end());
