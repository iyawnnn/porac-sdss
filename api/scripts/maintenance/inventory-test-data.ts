import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import {
  inventoryFailure,
  inventoryOptions,
  inventoryTarget,
} from '../lib/test-data-inventory-options';
import { readInventory } from '../lib/test-data-inventory';
import { writeInventoryReport } from '../lib/test-data-inventory-output';

export async function main() {
  const options = inventoryOptions(process.argv.slice(2));
  const target = inventoryTarget(process.env.DATABASE_URL, options);
  const root = resolve(__dirname, '../../..');
  const gitCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    stdio: 'pipe',
  }).trim();
  // No shared db/seed module import: validation succeeds before client construction.
  const pg = postgres(process.env.DATABASE_URL!, {
    max: 1,
    connect_timeout: 10,
    onnotice: () => {},
  });
  try {
    const report = await readInventory(drizzle(pg), options);
    const folder = writeInventoryReport({ ...report, target, gitCommit }, root);
    console.log(
      JSON.stringify({
        mode: 'read-only-review',
        target,
        folder,
        candidateCounts: report.candidateCounts,
        unresolvedReferences: report.unresolvedReferences.length,
      }),
    );
  } finally {
    await pg.end({ timeout: 2 });
  }
}
if (require.main === module)
  void main().catch((error: unknown) => {
    console.error(inventoryFailure(error));
    process.exitCode = 1;
  });
