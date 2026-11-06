import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { TransactionSql } from 'postgres';
import {
  AdminAuditService,
  type LogAdminAuditInput,
} from '../../src/admin/admin-audit.service';

// Presentation resets recreate deterministic target ids. Retain ALL old audit
// rows and skip an identical actor/action/target/metadata snapshot on rerun,
// including pre-7b seed rows. Different status transitions remain distinct.
// The transaction lock serializes two seed writers for the same target.
export class DemoAuditService extends AdminAuditService {
  override async logInPgTx(tx: TransactionSql, input: LogAdminAuditInput) {
    const key = `presentation-audit:${input.targetType}:${input.targetId}`;
    await tx`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
    const [existing] = await tx`
      SELECT EXISTS (SELECT 1 FROM admin_audit_events
        WHERE actor_admin_id = ${input.actor.adminId} AND action_type = ${input.actionType}
          AND target_type = ${input.targetType} AND target_id = ${input.targetId}
          AND coalesce(metadata, '{}'::jsonb) = ${JSON.stringify(input.metadata ?? {})}::jsonb) AS found
    `;
    if (!existing.found) await super.logInPgTx(tx, input);
  }

  override async logInTx(tx: PostgresJsDatabase, input: LogAdminAuditInput) {
    const key = `presentation-audit:${input.targetType}:${input.targetId}`;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
    const [existing] = await tx.execute<{ found: boolean }>(sql`
      SELECT EXISTS (SELECT 1 FROM admin_audit_events
        WHERE actor_admin_id = ${input.actor.adminId} AND action_type = ${input.actionType}
          AND target_type = ${input.targetType} AND target_id = ${input.targetId}
          AND coalesce(metadata, '{}'::jsonb) = ${JSON.stringify(input.metadata ?? {})}::jsonb) AS found
    `);
    if (!existing.found) await super.logInTx(tx, input);
  }
}
