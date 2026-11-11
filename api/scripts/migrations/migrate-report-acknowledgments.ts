import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Sql } from 'postgres';
import {
  acknowledgmentState,
  lockAcknowledgmentMigration,
  migrationError,
  verifyAcknowledgmentContraction,
  verifyAcknowledgmentDefinitions,
} from '../lib/acknowledgment-contraction';

export async function migrateReportAcknowledgments(sql: Sql) {
  return sql.begin(async (tx) => {
    await lockAcknowledgmentMigration(tx);
    const state = await acknowledgmentState(tx);
    if (state.ticket && !state.legacy) {
      await verifyAcknowledgmentContraction(tx);
      return;
    }
    if (!state.legacy) {
      const [upgraded] = await tx<{ exists: boolean }[]>`
        SELECT EXISTS(SELECT 1 FROM pg_attribute
          WHERE attrelid=to_regclass('public.operational_assessments')
            AND attname='assessed_conditions' AND NOT attisdropped) AS exists
      `;
      if (upgraded.exists)
        throw new Error(
          '0031 acknowledgment tables missing in an upgraded database; refusing to recreate history',
        );
      await tx.unsafe(
        readFileSync(
          join(__dirname, '../../drizzle/0031_report_acknowledgments.sql'),
          'utf8',
        ).replace(
          // The locked runner uses pg_catalog,public as its search_path.
          'CREATE TABLE IF NOT EXISTS report_acknowledgments',
          'CREATE TABLE IF NOT EXISTS public.report_acknowledgments',
        ),
      );
    }
    await verifyAcknowledgmentDefinitions(tx);
    console.log('0031 acknowledgment state verified');
  });
}
if (require.main === module) {
  void (async () => {
    const { sql } = (await import('../db.js')) as { sql: Sql };
    try {
      await migrateReportAcknowledgments(sql);
    } finally {
      await sql.end();
    }
  })().catch((error: unknown) => {
    console.error(migrationError(error));
    process.exitCode = 1;
  });
}
