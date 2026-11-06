import type { TransactionSql } from 'postgres';
import { AUDIT_ACTIONS } from '../../src/contracts/admin-audit';

// INSERT only. Reserve a fresh, distinctive soft target id per global setup;
// previous runs' audit rows may accumulate forever without matching this run.
// No citizen, report or ticket creation. Fixed instants straddle Manila midnight.
export async function insertAuditViewFixtures(tx: TransactionSql) {
  const [actor] = await tx<{ id: number }[]>`
    SELECT id FROM admins WHERE account_type = 'SYSTEM_ADMIN' AND is_active = true ORDER BY id LIMIT 1
  `;
  if (!actor)
    throw new Error('Audit fixtures need an active System Administrator.');
  const [target] = await tx<{ id: number }[]>`
    SELECT (1000000000 + nextval('admin_audit_events_id_seq'))::int AS id
  `;
  for (const [index, action] of [
    ...AUDIT_ACTIONS,
    'admin_login' as const,
  ].entries()) {
    const at =
      index === AUDIT_ACTIONS.length
        ? '2026-11-05T16:00:00.000Z'
        : '2026-11-05T15:59:00.000Z';
    await tx`
      INSERT INTO admin_audit_events (
        actor_admin_id, actor_name, actor_email, actor_role, actor_account_type, actor_is_focal, actor_office,
        action_type, target_type, target_id, target_summary, metadata, created_at
      ) SELECT id, concat_ws(' ', first_name, last_name), email, role, account_type, is_focal, office,
        ${action}, 'ticket', ${target.id}, 'E2E PRIVATE TITLE',
        ${JSON.stringify({
          reason: 'E2E PRIVATE REASON',
          remarks: 'E2E PRIVATE REMARKS',
          email: 'private@example.test',
          lat: 15.123456,
          assignedAdminId: 987654321,
          from: { accountType: 'PERSONNEL', office: 'MEO', isFocal: false },
          to: { accountType: 'PERSONNEL', office: 'MDRRMO', isFocal: true },
          sessionsEnded: true,
        })}::jsonb,
        ${at}::timestamptz FROM admins WHERE id = ${actor.id}
    `;
  }
  return { targetId: target.id, actorId: actor.id };
}
