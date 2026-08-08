import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, isNotNull, lt, sql as dsql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DB } from '../db/db.module';
import { tickets, workOrders } from '../db/schema';
import type { AdminSession } from '../auth/session.service';
import { resolveOfficeScope, assertOfficeAccess } from '../common/authz/admin-scope';
import { NotificationsService } from '../notifications/notifications.service';
import { AdminAuditService } from './admin-audit.service';

export type WorkOrderStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
const WORK_ORDER_STATUSES: WorkOrderStatus[] = [
  'pending',
  'in_progress',
  'completed',
  'cancelled',
];

export interface WorkOrderRow {
  id: number;
  ticket_id: number;
  title: string;
  notes: string | null;
  assigned_office: 'MEO' | 'MDRRMO';
  assigned_admin_id: number | null;
  status: WorkOrderStatus;
  due_date: Date | null;
  created_by_admin_id: number;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
}

export interface WorkOrderFilters {
  office?: 'MEO' | 'MDRRMO';
  status?: WorkOrderStatus;
  ticketId?: number;
  assignedAdminId?: number;
  overdue?: boolean;
  page?: number;
  limit?: number;
}

export interface PaginatedWorkOrders {
  workOrders: WorkOrderRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const SAFE_COLUMNS = {
  id: workOrders.id,
  ticket_id: workOrders.ticketId,
  title: workOrders.title,
  notes: workOrders.notes,
  assigned_office: workOrders.assignedOffice,
  assigned_admin_id: workOrders.assignedAdminId,
  status: workOrders.status,
  due_date: workOrders.dueDate,
  created_by_admin_id: workOrders.createdByAdminId,
  created_at: workOrders.createdAt,
  updated_at: workOrders.updatedAt,
  completed_at: workOrders.completedAt,
};

const PAGE_LIMITS = [10, 15, 25, 50] as const;
const DEFAULT_PAGE_LIMIT = 15;

function actorFrom(admin: AdminSession) {
  return {
    adminId: admin.adminId,
    adminName: admin.adminName,
    email: admin.email,
    role: admin.role,
    office: admin.office,
  };
}

@Injectable()
export class WorkOrdersService {
  constructor(
    @Inject(DB) private readonly db: PostgresJsDatabase,
    private readonly notifications: NotificationsService,
    private readonly audit: AdminAuditService,
  ) {}

  parseQuery(
    query: Record<string, string | undefined>,
    admin: Pick<AdminSession, 'role' | 'office'>,
  ): WorkOrderFilters {
    const requestedOffice =
      query.office === 'all' || query.office === 'MEO' || query.office === 'MDRRMO'
        ? query.office
        : undefined;
    const office = resolveOfficeScope(admin, requestedOffice);
    const status = WORK_ORDER_STATUSES.includes(query.status as WorkOrderStatus)
      ? (query.status as WorkOrderStatus)
      : undefined;
    const ticketId = query.ticketId ? Number(query.ticketId) : undefined;
    const assignedAdminId = query.assignedAdminId ? Number(query.assignedAdminId) : undefined;
    const overdue = query.overdue === 'true' ? true : undefined;
    const page = Math.max(1, Number(query.page) || 1);
    const limit = PAGE_LIMITS.includes(
      Number(query.limit) as (typeof PAGE_LIMITS)[number],
    )
      ? Number(query.limit)
      : DEFAULT_PAGE_LIMIT;
    return { office, status, ticketId, assignedAdminId, overdue, page, limit };
  }

  async list(filters: WorkOrderFilters = {}): Promise<PaginatedWorkOrders> {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.max(1, Math.min(100, filters.limit ?? DEFAULT_PAGE_LIMIT));
    const conditions = [
      filters.office ? eq(workOrders.assignedOffice, filters.office) : undefined,
      filters.status ? eq(workOrders.status, filters.status) : undefined,
      filters.ticketId ? eq(workOrders.ticketId, filters.ticketId) : undefined,
      filters.assignedAdminId
        ? eq(workOrders.assignedAdminId, filters.assignedAdminId)
        : undefined,
      filters.overdue
        ? and(
            isNotNull(workOrders.dueDate),
            lt(workOrders.dueDate, new Date()),
            dsql`${workOrders.status} NOT IN ('completed', 'cancelled')`,
          )
        : undefined,
    ].filter((c) => c !== undefined);
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select(SAFE_COLUMNS)
        .from(workOrders)
        .where(where)
        .orderBy(desc(workOrders.createdAt))
        .limit(limit)
        .offset((page - 1) * limit),
      this.db
        .select({ total: dsql<number>`count(*)::int` })
        .from(workOrders)
        .where(where),
    ]);

    return {
      workOrders: rows as WorkOrderRow[],
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async get(
    id: number,
    admin: Pick<AdminSession, 'role' | 'office'>,
  ): Promise<WorkOrderRow> {
    const [row] = await this.db
      .select(SAFE_COLUMNS)
      .from(workOrders)
      .where(eq(workOrders.id, id));
    if (!row) throw new NotFoundException('Work order not found.');
    assertOfficeAccess(admin, row.assigned_office as 'MEO' | 'MDRRMO');
    return row as WorkOrderRow;
  }

  async create(
    input: { ticketId: unknown; title: unknown; notes: unknown; assignedAdminId: unknown; dueDate: unknown },
    admin: AdminSession,
  ): Promise<WorkOrderRow> {
    const ticketId = Number(input.ticketId);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      throw new BadRequestException('ticketId is required.');
    }
    if (typeof input.title !== 'string' || !input.title.trim()) {
      throw new BadRequestException('title is required.');
    }
    const notes =
      typeof input.notes === 'string' && input.notes.trim() ? input.notes.trim() : null;
    const assignedAdminId =
      input.assignedAdminId != null ? Number(input.assignedAdminId) : null;
    if (assignedAdminId != null && !Number.isInteger(assignedAdminId)) {
      throw new BadRequestException('assignedAdminId must be an integer.');
    }
    const dueDate = input.dueDate ? new Date(input.dueDate as string) : null;
    if (dueDate && Number.isNaN(dueDate.getTime())) {
      throw new BadRequestException('dueDate is not a valid date.');
    }

    const [ticket] = await this.db
      .select({ assignedOffice: tickets.assignedOffice })
      .from(tickets)
      .where(eq(tickets.id, ticketId));
    if (!ticket) throw new NotFoundException('Ticket not found.');
    assertOfficeAccess(admin, ticket.assignedOffice);

    const row = await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(workOrders)
        .values({
          ticketId,
          title: input.title as string,
          notes,
          assignedOffice: ticket.assignedOffice,
          assignedAdminId,
          createdByAdminId: admin.adminId,
          dueDate,
        })
        .returning(SAFE_COLUMNS);
      await this.audit.logInTx(tx, {
        actor: actorFrom(admin),
        actionType: 'work_order_created',
        targetType: 'work_order',
        targetId: created.id,
        targetSummary: `Work order #${created.id} for Ticket #${ticketId}`,
        metadata: { ticketId, assignedOffice: ticket.assignedOffice, hasDueDate: dueDate !== null },
      });
      return created;
    });

    if (assignedAdminId) {
      await this.notifications.create({
        recipientType: 'admin',
        recipientId: assignedAdminId,
        type: 'work_order_assigned',
        title: 'Work order assigned',
        message: `You were assigned work order "${row.title}" on Ticket #${ticketId}.`,
        href: `/admin/tickets/${ticketId}`,
        entityType: 'work_order',
        entityId: row.id,
      });
    } else {
      await this.notifications.create({
        recipientType: 'admin',
        recipientOffice: ticket.assignedOffice,
        type: 'work_order_created',
        title: 'New work order',
        message: `Work order "${row.title}" was created for Ticket #${ticketId}.`,
        href: `/admin/tickets/${ticketId}`,
        entityType: 'work_order',
        entityId: row.id,
      });
    }

    return row as WorkOrderRow;
  }

  async update(
    id: number,
    input: { title: unknown; notes: unknown; assignedAdminId: unknown; dueDate: unknown },
    admin: AdminSession,
  ): Promise<WorkOrderRow> {
    const [existing] = await this.db
      .select(SAFE_COLUMNS)
      .from(workOrders)
      .where(eq(workOrders.id, id));
    if (!existing) throw new NotFoundException('Work order not found.');
    assertOfficeAccess(admin, existing.assigned_office as 'MEO' | 'MDRRMO');

    const patch: Partial<typeof workOrders.$inferInsert> = { updatedAt: new Date() };
    const changedFields: string[] = [];
    if (input.title !== undefined) {
      if (typeof input.title !== 'string' || !input.title.trim()) {
        throw new BadRequestException('title cannot be empty.');
      }
      patch.title = input.title.trim();
      changedFields.push('title');
    }
    if (input.notes !== undefined) {
      patch.notes = typeof input.notes === 'string' && input.notes.trim() ? input.notes.trim() : null;
      changedFields.push('notes');
    }
    if (input.assignedAdminId !== undefined) {
      const assignedAdminId = input.assignedAdminId != null ? Number(input.assignedAdminId) : null;
      if (assignedAdminId != null && !Number.isInteger(assignedAdminId)) {
        throw new BadRequestException('assignedAdminId must be an integer.');
      }
      patch.assignedAdminId = assignedAdminId;
      changedFields.push('assignedAdminId');
    }
    if (input.dueDate !== undefined) {
      const dueDate = input.dueDate ? new Date(input.dueDate as string) : null;
      if (dueDate && Number.isNaN(dueDate.getTime())) {
        throw new BadRequestException('dueDate is not a valid date.');
      }
      patch.dueDate = dueDate;
      changedFields.push('dueDate');
    }

    const row = await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(workOrders)
        .set(patch)
        .where(eq(workOrders.id, id))
        .returning(SAFE_COLUMNS);
      await this.audit.logInTx(tx, {
        actor: actorFrom(admin),
        actionType: 'work_order_updated',
        targetType: 'work_order',
        targetId: id,
        targetSummary: `Work order #${id} for Ticket #${existing.ticket_id}`,
        // Field names only — note bodies are never written to the audit trail.
        metadata: { changedFields },
      });
      return updated;
    });

    return row as WorkOrderRow;
  }

  async setStatus(
    id: number,
    status: unknown,
    admin: AdminSession,
  ): Promise<WorkOrderRow> {
    if (!WORK_ORDER_STATUSES.includes(status as WorkOrderStatus)) {
      throw new BadRequestException(
        `status must be one of ${WORK_ORDER_STATUSES.join(', ')}.`,
      );
    }
    const nextStatus = status as WorkOrderStatus;

    const [existing] = await this.db
      .select(SAFE_COLUMNS)
      .from(workOrders)
      .where(eq(workOrders.id, id));
    if (!existing) throw new NotFoundException('Work order not found.');
    assertOfficeAccess(admin, existing.assigned_office as 'MEO' | 'MDRRMO');

    const completedAt = nextStatus === 'completed' ? new Date() : null;

    const row = await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(workOrders)
        .set({ status: nextStatus, completedAt, updatedAt: new Date() })
        .where(eq(workOrders.id, id))
        .returning(SAFE_COLUMNS);
      await this.audit.logInTx(tx, {
        actor: actorFrom(admin),
        actionType:
          nextStatus === 'completed'
            ? 'work_order_completed'
            : nextStatus === 'cancelled'
              ? 'work_order_cancelled'
              : 'work_order_status_changed',
        targetType: 'work_order',
        targetId: id,
        targetSummary: `Work order #${id} for Ticket #${existing.ticket_id}`,
        metadata: { from: existing.status, to: nextStatus },
      });
      return updated;
    });

    return row as WorkOrderRow;
  }
}
