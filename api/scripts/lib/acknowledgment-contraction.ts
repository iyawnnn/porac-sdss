import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TransactionSql } from 'postgres';

export const ACK_CONTRACTION_SQL = readFileSync(
  join(__dirname, '../../drizzle/0050_report_acknowledgments_contraction.sql'),
  'utf8',
);
export const ACK_DEFINITIONS_SQL = `DO $definitions$ BEGIN ${
  ACK_CONTRACTION_SQL.split('-- BEGIN ACKNOWLEDGMENT DEFINITIONS')[1].split(
    '-- END ACKNOWLEDGMENT DEFINITIONS',
  )[0]
} END $definitions$;`;
export const ACK_CANONICAL_QUERY = ACK_CONTRACTION_SQL.split(
  '-- BEGIN CANONICAL ROW QUERY',
)[1].split('-- END CANONICAL ROW QUERY')[0];

export async function lockAcknowledgmentMigration(tx: TransactionSql) {
  await tx.unsafe("SET LOCAL lock_timeout = '5s'");
  await tx.unsafe("SET LOCAL statement_timeout = '60s'");
  await tx.unsafe('SET LOCAL search_path = pg_catalog, public');
  await tx`SELECT pg_advisory_xact_lock(8048,1)`;
  await tx`SELECT pg_advisory_xact_lock(8049,1)`;
  await tx`SELECT pg_advisory_xact_lock(8050,1)`;
}

export async function acknowledgmentState(tx: TransactionSql) {
  const [state] = await tx<{ legacy: boolean; ticket: boolean }[]>`
    SELECT to_regclass('public.report_acknowledgments') IS NOT NULL legacy,
      to_regclass('public.acknowledgments') IS NOT NULL ticket
  `;
  return state;
}

export async function verifyAcknowledgmentDefinitions(tx: TransactionSql) {
  await tx.unsafe(ACK_DEFINITIONS_SQL);
}

// Final-state execution returns before the archive guard or any DDL. Used by
// historical entry points so they cannot recreate 0031 or repeat 0038's backfill.
export async function verifyAcknowledgmentContraction(tx: TransactionSql) {
  const state = await acknowledgmentState(tx);
  if (state.legacy || !state.ticket)
    throw new Error('0050 final acknowledgment state is required');
  await tx.unsafe(ACK_CONTRACTION_SQL);
}

export function migrationError(error: unknown): string {
  return (
    error instanceof Error ? error.message : 'Acknowledgment operation failed'
  ).replace(/postgres(?:ql)?:\/\/\S+/gi, '[redacted]');
}
