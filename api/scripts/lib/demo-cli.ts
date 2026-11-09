import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import type { Sql } from 'postgres';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DemoMediaService } from './demo-services';
import { runDemoWorkflow } from './demo-workflow';

export function localDemoMedia() {
  return new DemoMediaService((image) => {
    const name =
      'phase8c-demo-' +
      createHash('sha256').update(image).digest('hex') +
      '.jpg';
    const directory = resolve(__dirname, '../../../public/uploads/reports');
    mkdirSync(directory, { recursive: true });
    writeFileSync(resolve(directory, name), image);
    return Promise.resolve('/uploads/reports/' + name);
  });
}
export async function runDemoSeed(pg: Sql, db: PostgresJsDatabase) {
  console.log(
    'Demo uses 15 real submissions. Do not run it and the full Playwright suite within the same hour (20 submissions/hour/IP).',
  );
  const manifest = await runDemoWorkflow(pg, db, localDemoMedia());
  console.log(JSON.stringify(manifest, null, 2));
}
