import type { Sql } from 'postgres';
import {
  ACK_CONTRACTION_SQL,
  acknowledgmentState,
  lockAcknowledgmentMigration,
  migrationError,
} from '../lib/acknowledgment-contraction';
import { readAcknowledgmentArchive } from '../lib/acknowledgment-archive';

export async function migrateReportAcknowledgmentsContraction(
  sql: Sql,
  archivePath?: string,
) {
  return sql.begin(async (tx) => {
    await lockAcknowledgmentMigration(tx);
    if ((await acknowledgmentState(tx)).legacy) {
      await tx.unsafe(
        'LOCK TABLE public.acknowledgments,public.report_intake_actions,public.notifications,public.tickets,public.reports,public.admin_audit_events IN SHARE MODE',
      );
      await tx.unsafe(
        'LOCK TABLE public.report_acknowledgments IN ACCESS EXCLUSIVE MODE',
      );
      if (!archivePath)
        throw new Error('0050 requires --archive <absolute JSONL path>');
      const archive = readAcknowledgmentArchive(archivePath);
      await tx`SELECT set_config('porac.ack_archive_count',${String(archive.rowCount)},true),
        set_config('porac.ack_archive_sha256',${archive.sha256},true)`;
    }
    await tx.unsafe(ACK_CONTRACTION_SQL);
  });
}

if (require.main === module) {
  void (async () => {
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 2 || args[0] !== '--archive'))
      throw new Error('Usage: migrate:ack-contraction [--archive <path>]');
    const { sql } = (await import('../db.js')) as { sql: Sql };
    try {
      await migrateReportAcknowledgmentsContraction(sql, args[1]);
    } finally {
      await sql.end();
    }
  })().catch((error: unknown) => {
    console.error(migrationError(error));
    process.exitCode = 1;
  });
}
