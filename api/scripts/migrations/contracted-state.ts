import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TransactionSql } from 'postgres';

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
  await tx.unsafe(CONTRACTION_SQL);
  console.log(
    '0049 contracted assessment/Work Order state verified; no changes',
  );
  return true;
}
