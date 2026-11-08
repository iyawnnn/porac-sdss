import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TransactionSql } from 'postgres';
import { verifyAcknowledgmentContraction } from '../lib/acknowledgment-contraction';

export const CONTRACTION_SQL = readFileSync(
  join(__dirname, '../../drizzle/0049_phase8b_contraction.sql'),
  'utf8',
);

// No client/env import and no schema writes. Both old runners use this exact
// final-state verifier in 0049, under the same lock, before considering old DDL.
export async function verifyContractedAssessments(tx: TransactionSql) {
  const [state] = await tx<
    { legacy: number; canonical: boolean; old: boolean }[]
  >`
    SELECT count(*) FILTER (WHERE attname LIKE 'legacy_%')::int legacy,
      bool_or(attname IN ('assessed_conditions','interim_mitigation','deferment_or_referral_reason')) canonical,
      count(*) FILTER (WHERE attname IN ('observed_conditions','temporary_mitigation','assessed_at'))=3 old
    FROM pg_attribute
    WHERE attrelid='public.operational_assessments'::regclass
      AND attnum>0 AND NOT attisdropped
  `;
  if (!state.canonical && !state.legacy && state.old) return false;
  if (!state.canonical) throw new Error('0049 unrecognized assessment state');
  if (state.legacy === 4) return false;
  if (state.legacy !== 0) throw new Error('0049 mixed assessment legacy state');
  // The full SQL recognizes the final state before any drop; it also rejects
  // a partial contraction outside assessments and verifies protected objects.
  await verifyPhase8bFinalState(tx);
  console.log(
    '0049 contracted assessment/Work Order state verified; no changes',
  );
  return true;
}

// 0050 removes a table that 0049 used only as protected history. Preserve the
// historical SQL, verify 0050 first, and protect the surviving canonical table
// in its place. This path is strictly final-state-only: never run 0049 DDL here.
export async function verifyPhase8bFinalState(tx: TransactionSql) {
  const [state] = await tx<{ legacy: boolean }[]>`
    SELECT to_regclass('public.report_acknowledgments') IS NOT NULL legacy
  `;
  if (state.legacy) return tx.unsafe(CONTRACTION_SQL);
  await tx`SELECT pg_advisory_xact_lock(8048,1)`;
  await tx`SELECT pg_advisory_xact_lock(8049,1)`;
  await tx`SELECT pg_advisory_xact_lock(8050,1)`;
  await verifyAcknowledgmentContraction(tx);
  await tx.unsafe(`DO $$ BEGIN
    IF to_regclass('public.config') IS NOT NULL
      OR to_regprocedure('public.admin_audit_events_fill_actor_account_type()') IS NOT NULL
      OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='admin_audit_events_fill_actor_account_type')
      OR EXISTS(SELECT 1 FROM pg_attribute WHERE attnum>0 AND NOT attisdropped AND (
        (attrelid='public.reports'::regclass AND attname='elevation_m') OR
        (attrelid='public.tickets'::regclass AND attname IN ('elevation_m','elevation_factor','precipitation_factor','cluster_factor','urgency_score','urgency_band','priority_score','urgency_level')) OR
        (attrelid='public.operational_assessments'::regclass AND attname LIKE 'legacy_%')))
    THEN RAISE EXCEPTION '0049 mixed state after 0050; nothing changed'; END IF;
  END $$;`);
  await tx.unsafe(
    CONTRACTION_SQL.replaceAll(
      'public.report_acknowledgments',
      'public.acknowledgments',
    ),
  );
}
