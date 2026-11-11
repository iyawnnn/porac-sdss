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

// Physical canonical table is acknowledgments (0038), not a renamed table.
export async function migrateTicketAcknowledgments(sql: Sql) {
  return sql.begin(async (tx) => {
    await lockAcknowledgmentMigration(tx);
    const state = await acknowledgmentState(tx);
    if (state.ticket && !state.legacy) {
      await verifyAcknowledgmentContraction(tx);
      return;
    }
    if (!state.legacy)
      throw new Error(
        '0038 source is missing before ticket acknowledgments exist',
      );
    await verifyAcknowledgmentDefinitions(tx);
    if (!state.ticket) {
      for (const statement of readFileSync(
        join(__dirname, '../../drizzle/0038_ticket_acknowledgments.sql'),
        'utf8',
      )
        // The locked runner uses pg_catalog,public as its search_path.
        .replace(
          'CREATE TABLE IF NOT EXISTS acknowledgments',
          'CREATE TABLE IF NOT EXISTS public.acknowledgments',
        )
        .split('--> statement-breakpoint')) {
        if (statement.trim()) await tx.unsafe(statement);
      }
    }
    // Already-created ticket rows are authoritative; never replay the lossy
    // backfill over current grouping/acknowledgment state on a later rerun.
    await verifyAcknowledgmentDefinitions(tx);
    console.log(
      '0038 ticket acknowledgment state verified; existing rows unchanged',
    );
  });
}
if (require.main === module) {
  void (async () => {
    const { sql } = (await import('../db.js')) as { sql: Sql };
    try {
      await migrateTicketAcknowledgments(sql);
    } finally {
      await sql.end();
    }
  })().catch((error: unknown) => {
    console.error(migrationError(error));
    process.exitCode = 1;
  });
}
