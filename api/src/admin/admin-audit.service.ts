import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { and, desc, eq, sql as dsql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { TransactionSql } from 'postgres';
import { DB } from '../db/db.module';
import { adminAuditEvents } from '../db/schema';
import type { AdminAccountType } from '../auth/session.service';
import type { AdminRole } from './admins.service';

// One append-only row per administrative action — System Administrator
// visible only (see AdminAuditController). Also covers admin login
// success/failure (admin_login/admin_login_failed) via logBestEffort below —
// see AuthService.adminLogin for the write sites and the nonexistent-email
// decision.
import {
  AUDIT_ACTIONS,
  type AdminAuditActionType,
  type AdminAuditTargetType,
  type PaginatedAdminAudit,
} from '../contracts/admin-audit';
import { auditItem } from './admin-audit-view';
export type {
  AdminAuditActionType,
  AdminAuditTargetType,
  PaginatedAdminAudit,
} from '../contracts/admin-audit';

// actor_role is not passed in: every write takes it from the actor's
// stored admins.role mirror (a subquery in the INSERT), since the session
// no longer carries a role. actor_account_type uses the same stored row,
// so an in-flight request's older session cannot produce a mixed snapshot.
export interface AdminAuditActor {
  adminId: number;
  adminName: string;
  email: string;
  accountType: AdminAccountType;
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

export interface AdminAuditFilters {
  actionType?: AdminAuditActionType;
  targetType?: AdminAuditTargetType;
  actorAdminId?: number;
  targetId?: number;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

const PAGE_LIMITS = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_LIMIT = 25;
const ACTION_TYPES: readonly string[] = AUDIT_ACTIONS;
const TARGET_TYPES: AdminAuditTargetType[] = [
  'admin',
  'ticket',
  'report',
  'work_order',
];

const VIEW_COLUMNS = {
  id: adminAuditEvents.id,
  actor_admin_id: adminAuditEvents.actorAdminId,
  actor_name: adminAuditEvents.actorName,
  actor_role: adminAuditEvents.actorRole,
  actor_account_type: adminAuditEvents.actorAccountType,
  actor_is_focal: adminAuditEvents.actorIsFocal,
  target_name: dsql<
    string | null
  >`(SELECT concat_ws(' ', first_name, last_name) FROM admins WHERE id = ${adminAuditEvents.targetId} AND ${adminAuditEvents.targetType} = 'admin')`,
  actor_office: adminAuditEvents.actorOffice,
  action_type: adminAuditEvents.actionType,
  target_type: adminAuditEvents.targetType,
  target_id: adminAuditEvents.targetId,
  metadata: adminAuditEvents.metadata,
  created_at: adminAuditEvents.createdAt,
};

// actor_role is permanently retained as immutable history: it is the
// actor's stored admins.role mirror, read in the same INSERT so it can't
// drift from what the admins row says.
function actorRoleOf(adminId: number) {
  return dsql<AdminRole>`(SELECT role FROM admins WHERE id = ${adminId})`;
}

function values(input: LogAdminAuditInput) {
  return {
    actorAdminId: input.actor.adminId,
    actorName: input.actor.adminName,
    actorEmail: input.actor.email,
    actorRole: actorRoleOf(input.actor.adminId),
    actorAccountType: dsql<AdminAccountType>`(SELECT account_type FROM admins WHERE id = ${input.actor.adminId})`,
    actorIsFocal: dsql<boolean>`(SELECT is_focal FROM admins WHERE id = ${input.actor.adminId})`,
    actorOffice: dsql<
      'MEO' | 'MDRRMO' | null
    >`(SELECT office FROM admins WHERE id = ${input.actor.adminId})`,
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
  async logInPgTx(
    tx: TransactionSql,
    input: LogAdminAuditInput,
  ): Promise<void> {
    const v = values(input);
    await tx`
      INSERT INTO admin_audit_events (
        actor_admin_id, actor_name, actor_email, actor_role, actor_account_type, actor_is_focal, actor_office,
        action_type, target_type, target_id, target_summary, metadata
      ) VALUES (
        ${v.actorAdminId}, ${v.actorName}, ${v.actorEmail},
        (SELECT role FROM admins WHERE id = ${v.actorAdminId}),
        (SELECT account_type FROM admins WHERE id = ${v.actorAdminId}),
        (SELECT is_focal FROM admins WHERE id = ${v.actorAdminId}),
        (SELECT office FROM admins WHERE id = ${v.actorAdminId}),
        ${v.actionType}, ${v.targetType}, ${v.targetId}, ${v.targetSummary},
        ${v.metadata ? JSON.stringify(v.metadata) : null}::jsonb
      )
    `;
  }

  // Same atomicity contract as logInPgTx, for the one call site that uses
  // a Drizzle transaction instead of a raw-PG one (admins.service.ts).
  async logInTx(
    tx: PostgresJsDatabase,
    input: LogAdminAuditInput,
  ): Promise<void> {
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
    const actionType = ACTION_TYPES.includes(
      query.actionType as AdminAuditActionType,
    )
      ? (query.actionType as AdminAuditActionType)
      : undefined;
    const targetType = TARGET_TYPES.includes(
      query.targetType as AdminAuditTargetType,
    )
      ? (query.targetType as AdminAuditTargetType)
      : undefined;
    const actorAdminId = positiveId(query.actorAdminId, 'Actor id');
    const from = query.from || undefined;
    const to = query.to || undefined;
    auditDateBounds(from, to);
    const targetId = positiveId(query.targetId, 'Target id');
    if (targetId && !targetType)
      throw new BadRequestException('Choose a target type with the target id.');
    const page = Math.max(1, Number(query.page) || 1);
    const limit = PAGE_LIMITS.includes(
      Number(query.limit) as (typeof PAGE_LIMITS)[number],
    )
      ? Number(query.limit)
      : DEFAULT_PAGE_LIMIT;
    return {
      actionType,
      targetType,
      actorAdminId,
      targetId,
      from,
      to,
      page,
      limit,
    };
  }

  async list(filters: AdminAuditFilters = {}): Promise<PaginatedAdminAudit> {
    const page = Math.max(1, Math.floor(filters.page ?? 1));
    const limit = Math.max(
      10,
      Math.min(100, Math.floor(filters.limit ?? DEFAULT_PAGE_LIMIT)),
    );
    const { from, until } = auditDateBounds(filters.from, filters.to);
    const conditions = [
      filters.actionType
        ? eq(adminAuditEvents.actionType, filters.actionType)
        : undefined,
      filters.targetType
        ? eq(adminAuditEvents.targetType, filters.targetType)
        : undefined,
      filters.actorAdminId
        ? eq(adminAuditEvents.actorAdminId, filters.actorAdminId)
        : undefined,
      filters.targetId
        ? eq(adminAuditEvents.targetId, filters.targetId)
        : undefined,
      from
        ? dsql`${adminAuditEvents.createdAt} >= ${from}::timestamptz`
        : undefined,
      until
        ? dsql`${adminAuditEvents.createdAt} < ${until}::timestamptz`
        : undefined,
    ].filter((c) => c !== undefined);
    const where = conditions.length ? and(...conditions) : undefined;
    const [events, [{ total }]] = await Promise.all([
      this.db
        .select(VIEW_COLUMNS)
        .from(adminAuditEvents)
        .where(where)
        .orderBy(desc(adminAuditEvents.createdAt), desc(adminAuditEvents.id))
        .limit(limit)
        .offset((page - 1) * limit),
      this.db
        .select({ total: dsql<number>`count(*)::int` })
        .from(adminAuditEvents)
        .where(where),
    ]);
    return {
      events: events.map(auditItem),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }
}

function positiveId(value: string | undefined, label: string) {
  if (!value) return undefined;
  if (
    !/^[1-9]\d*$/.test(value) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) > 2147483647
  )
    throw new BadRequestException(label + ' must be a positive integer.');
  return Number(value);
}

// Manila has UTC+08:00, with no DST. Exclusive next-day bound includes
// every PostgreSQL microsecond of the requested final calendar day.
export function auditDateBounds(from?: string, to?: string) {
  const day = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
      throw new BadRequestException(
        'Dates must be valid YYYY-MM-DD calendar days.',
      );
    const parsed = new Date(value + 'T00:00:00.000Z');
    if (
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== value
    )
      throw new BadRequestException(
        'Dates must be valid YYYY-MM-DD calendar days.',
      );
    return parsed.getTime();
  };
  const first = from ? day(from) : undefined;
  const last = to ? day(to) : undefined;
  if (first !== undefined && last !== undefined && first > last)
    throw new BadRequestException('From date must be on or before to date.');
  const offset = 8 * 60 * 60 * 1000;
  return {
    from:
      first === undefined ? undefined : new Date(first - offset).toISOString(),
    until:
      last === undefined
        ? undefined
        : new Date(last + 86400000 - offset).toISOString(),
  };
}
