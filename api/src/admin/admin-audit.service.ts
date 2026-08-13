import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, gte, lte, sql as dsql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { TransactionSql } from 'postgres';
import { DB } from '../db/db.module';
import { adminAuditEvents } from '../db/schema';
import type { AdminRole } from './admins.service';

// One append-only row per administrative action — System Administrator
// visible only (see AdminAuditController). Also covers admin login
// success/failure (admin_login/admin_login_failed) via logBestEffort below —
// see AuthService.adminLogin for the write sites and the nonexistent-email
// decision.
export type AdminAuditActionType =
  | 'admin_created'
  | 'admin_role_updated'
  | 'admin_password_changed'
  | 'admin_password_reset'
  | 'admin_deactivated'
  | 'admin_reactivated'
  | 'admin_login'
  | 'admin_login_failed'
  | 'ticket_status_advanced'
  | 'ticket_reassigned'
  | 'report_moderated'
  | 'work_order_created'
  | 'work_order_updated'
  | 'work_order_status_changed'
  | 'work_order_completed'
  | 'work_order_cancelled';

export type AdminAuditTargetType = 'admin' | 'ticket' | 'report' | 'work_order';

export interface AdminAuditActor {
  adminId: number;
  adminName: string;
  email: string;
  role: AdminRole;
  office: 'MEO' | 'MDRRMO' | null;
}

export interface LogAdminAuditInput {
  actor: AdminAuditActor;
  actionType: AdminAuditActionType;
  targetType: AdminAuditTargetType;
  targetId: number;
  targetSummary: string;
  metadata?: Record<string, unknown>;
}

export interface AdminAuditRow {
  id: number;
  actor_admin_id: number;
  actor_name: string;
  actor_email: string;
  actor_role: AdminRole;
  actor_office: 'MEO' | 'MDRRMO' | null;
  action_type: AdminAuditActionType;
  target_type: AdminAuditTargetType;
  target_id: number;
  target_summary: string;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

export interface AdminAuditFilters {
  actionType?: AdminAuditActionType;
  targetType?: AdminAuditTargetType;
  actorAdminId?: number;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedAdminAudit {
  events: AdminAuditRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const PAGE_LIMITS = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_LIMIT = 25;
const ACTION_TYPES: AdminAuditActionType[] = [
  'admin_created',
  'admin_role_updated',
  'admin_password_changed',
  'admin_password_reset',
  'admin_deactivated',
  'admin_reactivated',
  'admin_login',
  'admin_login_failed',
  'ticket_status_advanced',
  'ticket_reassigned',
  'report_moderated',
  'work_order_created',
  'work_order_updated',
  'work_order_status_changed',
  'work_order_completed',
  'work_order_cancelled',
];
const TARGET_TYPES: AdminAuditTargetType[] = ['admin', 'ticket', 'report', 'work_order'];

const SAFE_COLUMNS = {
  id: adminAuditEvents.id,
  actor_admin_id: adminAuditEvents.actorAdminId,
  actor_name: adminAuditEvents.actorName,
  actor_email: adminAuditEvents.actorEmail,
  actor_role: adminAuditEvents.actorRole,
  actor_office: adminAuditEvents.actorOffice,
  action_type: adminAuditEvents.actionType,
  target_type: adminAuditEvents.targetType,
  target_id: adminAuditEvents.targetId,
  target_summary: adminAuditEvents.targetSummary,
  metadata: adminAuditEvents.metadata,
  created_at: adminAuditEvents.createdAt,
};

function values(input: LogAdminAuditInput) {
  return {
    actorAdminId: input.actor.adminId,
    actorName: input.actor.adminName,
    actorEmail: input.actor.email,
    actorRole: input.actor.role,
    actorOffice: input.actor.office,
    actionType: input.actionType,
    targetType: input.targetType,
    targetId: input.targetId,
    targetSummary: input.targetSummary,
    metadata: input.metadata ?? null,
  };
}

@Injectable()
export class AdminAuditService {
  private readonly logger = new Logger(AdminAuditService.name);

  constructor(@Inject(DB) private readonly db: PostgresJsDatabase) {}

  // For call sites already inside a raw-PG transaction (sql.begin) —
  // tickets.service.ts's advanceStatus/reassignOffice and
  // moderation.service.ts's moderateReport. Writing inside the same `tx`
  // as the state change makes the audit row atomic with it: if the
  // transaction rolls back, no audit event survives either, so a failed
  // action can never leave behind a misleading "this happened" record.
  // Conversely, if this INSERT itself fails, it throws and rolls back the
  // whole transaction — the audit trail for admin actions is treated as
  // load-bearing, not best-effort, so a broken audit write blocks the
  // action rather than silently going missing.
  async logInPgTx(tx: TransactionSql, input: LogAdminAuditInput): Promise<void> {
    const v = values(input);
    await tx`
      INSERT INTO admin_audit_events (
        actor_admin_id, actor_name, actor_email, actor_role, actor_office,
        action_type, target_type, target_id, target_summary, metadata
      ) VALUES (
        ${v.actorAdminId}, ${v.actorName}, ${v.actorEmail}, ${v.actorRole}, ${v.actorOffice ?? null},
        ${v.actionType}, ${v.targetType}, ${v.targetId}, ${v.targetSummary},
        ${v.metadata ? JSON.stringify(v.metadata) : null}::jsonb
      )
    `;
  }

  // Same atomicity contract as logInPgTx, for the one call site that uses
  // a Drizzle transaction instead of a raw-PG one (admins.service.ts).
  async logInTx(tx: PostgresJsDatabase, input: LogAdminAuditInput): Promise<void> {
    await tx.insert(adminAuditEvents).values(values(input));
  }

  // Login has no accompanying mutation transaction to join — unlike every
  // logInTx/logInPgTx call site above, there is no state change here for
  // this write to be atomic with. Deliberately best-effort: errors are
  // caught and logged, never rethrown, so a broken audit insert can never
  // block a legitimate admin login. Used only by AuthService.adminLogin for
  // admin_login/admin_login_failed.
  async logBestEffort(input: LogAdminAuditInput): Promise<void> {
    try {
      await this.db.insert(adminAuditEvents).values(values(input));
    } catch (err) {
      this.logger.error('Failed to write login audit event', err as Error);
    }
  }

  parseFilters(query: Record<string, string | undefined>): AdminAuditFilters {
    const actionType = ACTION_TYPES.includes(query.actionType as AdminAuditActionType)
      ? (query.actionType as AdminAuditActionType)
      : undefined;
    const targetType = TARGET_TYPES.includes(query.targetType as AdminAuditTargetType)
      ? (query.targetType as AdminAuditTargetType)
      : undefined;
    const actorAdminId = query.actorAdminId ? Number(query.actorAdminId) : undefined;
    const from = query.from?.trim() || undefined;
    const to = query.to?.trim() || undefined;
    const page = Math.max(1, Number(query.page) || 1);
    const limit = PAGE_LIMITS.includes(Number(query.limit) as (typeof PAGE_LIMITS)[number])
      ? Number(query.limit)
      : DEFAULT_PAGE_LIMIT;
    return { actionType, targetType, actorAdminId, from, to, page, limit };
  }

  async list(filters: AdminAuditFilters = {}): Promise<PaginatedAdminAudit> {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.max(1, Math.min(100, filters.limit ?? DEFAULT_PAGE_LIMIT));
    const conditions = [
      filters.actionType ? eq(adminAuditEvents.actionType, filters.actionType) : undefined,
      filters.targetType ? eq(adminAuditEvents.targetType, filters.targetType) : undefined,
      filters.actorAdminId ? eq(adminAuditEvents.actorAdminId, filters.actorAdminId) : undefined,
      filters.from ? gte(adminAuditEvents.createdAt, new Date(filters.from)) : undefined,
      // Exclusive upper bound at the start of the next day, so `to` is
      // inclusive of the whole calendar day a caller picks.
      filters.to
        ? lte(adminAuditEvents.createdAt, new Date(`${filters.to}T23:59:59.999Z`))
        : undefined,
    ].filter((c) => c !== undefined);
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [events, [{ total }]] = await Promise.all([
      this.db
        .select(SAFE_COLUMNS)
        .from(adminAuditEvents)
        .where(where)
        .orderBy(desc(adminAuditEvents.createdAt))
        .limit(limit)
        .offset((page - 1) * limit),
      this.db
        .select({ total: dsql<number>`count(*)::int` })
        .from(adminAuditEvents)
        .where(where),
    ]);

    return {
      events: events as AdminAuditRow[],
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }
}
