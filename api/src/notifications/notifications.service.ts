import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNotNull, isNull, lt, lte, or } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { TransactionSql } from 'postgres';
import { DB } from '../db/db.module';
import { notifications } from '../db/schema';
import { isOperationalStaff } from '../common/authz/admin-scope';
import type { AdminRole } from '../admin/admins.service';

export type NotificationPrincipal =
  // office is null only for a system_admin admin session — see
  // api/src/common/authz/admin-scope.ts. `role` is what actually decides
  // office-wide matching below (Batch 2 fix) — office alone used to be
  // treated as "null = show every office," which meant system_admin
  // silently received every MEO+MDRRMO office-wide notification. focal also
  // carries office: 'MDRRMO' (organizationally) but must not inherit
  // MDRRMO's office-wide operational notifications either — only
  // isOperationalStaff (officer/supervisor) does.
  | {
      type: 'admin';
      adminId: number;
      office: 'MEO' | 'MDRRMO' | null;
      role: AdminRole;
    }
  | { type: 'citizen'; citizenId: number };

export interface CreateNotificationInput {
  recipientType: 'admin' | 'citizen';
  recipientId?: number;
  recipientOffice?: 'MEO' | 'MDRRMO';
  type: string;
  title: string;
  message: string;
  href?: string;
  entityType?: string;
  entityId?: number;
}

const DEFAULT_PAGE_SIZE = 10;
const RETENTION_DAYS = 30;

@Injectable()
export class NotificationsService {
  constructor(@Inject(DB) private readonly db: PostgresJsDatabase) {}

  // For call sites that already have an open raw-PG transaction (report
  // submission, ticket status transition, urgency recompute) — inserting
  // here makes the notification atomic with the triggering mutation, no
  // separate commit, no window where one could exist without the other.
  // notifications has no geometry column, so this is a plain tagged-
  // template INSERT alongside whatever else is already in that `tx`.
  async createInTx(tx: TransactionSql, input: CreateNotificationInput): Promise<void> {
    await tx`
      INSERT INTO notifications (
        recipient_type, recipient_id, recipient_office,
        type, title, message, href, entity_type, entity_id
      ) VALUES (
        ${input.recipientType}, ${input.recipientId ?? null}, ${input.recipientOffice ?? null},
        ${input.type}, ${input.title}, ${input.message},
        ${input.href ?? null}, ${input.entityType ?? null}, ${input.entityId ?? null}
      )
    `;
  }

  // Standalone variant for call sites with no open transaction of their own.
  async create(input: CreateNotificationInput): Promise<void> {
    await this.db.insert(notifications).values({
      recipientType: input.recipientType,
      recipientId: input.recipientId ?? null,
      recipientOffice: input.recipientOffice ?? null,
      type: input.type,
      title: input.title,
      message: input.message,
      href: input.href ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
    });
  }

  // Authorization boundary: a citizen only ever sees rows addressed to
  // their own citizenId. An admin always sees rows addressed directly to
  // their own adminId; ADDITIONALLY sees office-wide (recipientOffice) rows
  // only when they're operational staff (officer/supervisor) — never focal
  // (which carries office: 'MDRRMO' organizationally but has no operational
  // office notifications) and never system_admin (office: null used to be
  // treated as "show every office," the fixed Batch 2 bug — system_admin
  // gets direct notifications only, same as any other non-operational role).
  private scopeFilter(principal: NotificationPrincipal) {
    if (principal.type === 'citizen') {
      return and(
        eq(notifications.recipientType, 'citizen'),
        eq(notifications.recipientId, principal.citizenId),
      );
    }
    const officeCondition =
      isOperationalStaff({ role: principal.role }) && principal.office
        ? eq(notifications.recipientOffice, principal.office)
        : undefined;
    return and(
      eq(notifications.recipientType, 'admin'),
      officeCondition
        ? or(eq(notifications.recipientId, principal.adminId), officeCondition)
        : eq(notifications.recipientId, principal.adminId),
    );
  }

  async listForPrincipal(
    principal: NotificationPrincipal,
    options: { before?: number; limit?: number; status?: 'all' | 'unread' | 'read'; type?: string } = {},
  ): Promise<{ items: (typeof notifications.$inferSelect)[]; nextCursor: number | null }> {
    const limit = options.limit ?? DEFAULT_PAGE_SIZE;
    // Additive on top of scopeFilter — status/type only ever narrow an
    // already-scoped result set, never widen it, so a bad/unrecognized
    // `type` value just yields zero rows rather than a security concern.
    const conditions = [this.scopeFilter(principal)];
    if (options.before) conditions.push(lt(notifications.id, options.before));
    if (options.status === 'unread') conditions.push(isNull(notifications.readAt));
    if (options.status === 'read') conditions.push(isNotNull(notifications.readAt));
    if (options.type) conditions.push(eq(notifications.type, options.type));
    const where = and(...conditions);

    const rows = await this.db
      .select()
      .from(notifications)
      .where(where)
      .orderBy(desc(notifications.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return {
      items,
      nextCursor: hasMore ? items[items.length - 1].id : null,
    };
  }

  async getUnreadCount(principal: NotificationPrincipal): Promise<number> {
    const rows = await this.db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(this.scopeFilter(principal), isNull(notifications.readAt)));
    return rows.length;
  }

  // Throws if the notification doesn't exist OR belongs to a different
  // principal — same "not found" either way, no distinction leaked.
  async markRead(principal: NotificationPrincipal, notificationId: number): Promise<void> {
    const result = await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.id, notificationId), this.scopeFilter(principal)))
      .returning({ id: notifications.id });
    if (result.length === 0) {
      throw new NotFoundException('Notification not found.');
    }
  }

  async markAllRead(principal: NotificationPrincipal): Promise<void> {
    await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(this.scopeFilter(principal), isNull(notifications.readAt)));
  }

  // Manual/on-demand trigger (POST /cron/cleanup-notifications), same
  // pattern as the password-reset-token cleanup job. Keeps unread
  // notifications regardless of age (nothing gets silently lost until the
  // recipient actually reads it) — only prunes ones already read and old.
  async cleanupOldNotifications(): Promise<void> {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
    await this.db
      .delete(notifications)
      .where(and(lte(notifications.readAt, cutoff)));
  }
}
