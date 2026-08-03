import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { citizenAuditEvents } from '../db/schema';

// Append-only — shared by oauth.service.ts (link/unlink/conflict events)
// and citizens/account.service.ts (password set/changed) so both write to
// the same table the same way.
export type CitizenAuditEventType =
  | 'provider_linked'
  | 'provider_unlinked'
  | 'password_set'
  | 'password_changed'
  | 'identity_link_conflict_rejected'
  | 'password_reset';

export async function logCitizenAuditEvent(
  db: PostgresJsDatabase,
  citizenId: number,
  eventType: CitizenAuditEventType,
  detail?: Record<string, unknown>,
): Promise<void> {
  await db.insert(citizenAuditEvents).values({
    citizenId,
    eventType,
    detail: detail ?? null,
  });
}
