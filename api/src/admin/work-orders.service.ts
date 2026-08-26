import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lt,
  lte,
  sql as dsql,
  type SQL,
} from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DB } from '../db/db.module';
import { admins, tickets, workOrders, workOrderStatusHistory } from '../db/schema';
import type { AdminSession } from '../auth/session.service';
import {
  resolveOfficeScope,
  assertOfficeAccess,
} from '../common/authz/admin-scope';
import { NotificationsService } from '../notifications/notifications.service';
import { AdminAuditService } from './admin-audit.service';
import {
  WORK_ORDER_TITLE_MAX_LENGTH,
  WORK_ORDER_NOTES_MAX_LENGTH,
} from '../contracts/schemas';

export type WorkOrderStatus =
  'pending' | 'in_progress' | 'completed' | 'cancelled';
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

// Feeds the admin dashboard's Office Performance Summary
// (dashboard.controller.ts) — deliberately just counts, never note bodies
// or other work-order content.
export interface WorkOrderPerformanceCounts {
  pendingWorkOrders: number;
  inProgressWorkOrders: number;
  overdueWorkOrders: number;
  completedWorkOrdersThisWeek: number;
}

export interface HighUrgencyTicketWithOpenWork {
  id: number;
  category: string;
  assigned_office: 'MEO' | 'MDRRMO';
  urgency_level: string | null;
  priority_score: number | null;
}

// Feeds the dashboard's "Needs Attention" section — small, office-scoped
// lists (never counts-only like WorkOrderPerformanceCounts) surfacing what
// an office should look at next: overdue work, due-today work, and
// high-urgency tickets whose field work hasn't started/finished yet.
export interface WorkOrderNeedsAttention {
  overdueWorkOrders: WorkOrderRow[];
  dueTodayWorkOrders: WorkOrderRow[];
  highUrgencyTicketsWithOpenWork: HighUrgencyTicketWithOpenWork[];
}

// Feeds ReportsService's CSV export — deliberately excludes `notes` (the
// internal office progress trail), matching the "no note bodies in exports"
// rule Work Orders already applies to dashboard summaries.
export interface WorkOrderExportRow {
  id: number;
  ticket_id: number;
  title: string;
  assigned_office: 'MEO' | 'MDRRMO';
  assigned_admin_name: string | null;
  assigned_admin_email: string | null;
  status: WorkOrderStatus;
  due_date: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

const ACTIVE_TICKET_STATUSES = [
  'Reported',
  'Under Review',
  'In Progress',
] as const;
const OPEN_WORK_ORDER_STATUSES = ['pending', 'in_progress'] as const;

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

  // A work order's assignee must be an active admin who belongs to *this*
  // work order's office — never the caller's own office, since a system
  // admin's office is null and an office admin's is already guaranteed to
  // match by assertOfficeAccess before this runs. This is the one place
  // that would let a cross-office leak into assigned_admin_id if skipped.
  private async assertValidAssignee(
    assignedAdminId: number,
    office: 'MEO' | 'MDRRMO',
  ): Promise<void> {
    const [assignee] = await this.db
      .select({ office: admins.office, isActive: admins.isActive })
      .from(admins)
      .where(eq(admins.id, assignedAdminId));
    if (!assignee || !assignee.isActive || assignee.office !== office) {
      throw new BadRequestException(
        'assignedAdminId must be an active admin belonging to this office.',
      );
    }
  }

  parseQuery(
    query: Record<string, string | undefined>,
    admin: Pick<AdminSession, 'role' | 'office' | 'adminId'>,
  ): WorkOrderFilters {
    const requestedOffice =
      query.office === 'all' ||
      query.office === 'MEO' ||
      query.office === 'MDRRMO'
        ? query.office
        : undefined;
    const office = resolveOfficeScope(admin, requestedOffice);
    const status = WORK_ORDER_STATUSES.includes(query.status as WorkOrderStatus)
      ? (query.status as WorkOrderStatus)
      : undefined;
    const ticketId = query.ticketId ? Number(query.ticketId) : undefined;
    // 'me' is a viewer-relative sentinel ("My Assignments" quick filter) —
    // resolved from the caller's own session, never trusted from the query
    // string as a raw id, so it can't be used to probe another admin's
    // assignments by id. Works identically for officers, supervisors, and
    // system admins, since every AdminSession carries its own adminId.
    const assignedAdminId =
      query.assignedAdminId === 'me'
        ? admin.adminId
        : query.assignedAdminId
          ? Number(query.assignedAdminId)
          : undefined;
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
    const limit = Math.max(
      1,
      Math.min(100, filters.limit ?? DEFAULT_PAGE_LIMIT),
    );
    const conditions = [
      filters.office
        ? eq(workOrders.assignedOffice, filters.office)
        : undefined,
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
      workOrders: rows,
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
    assertOfficeAccess(admin, row.assigned_office);
    return row;
  }

  async create(
    input: {
      ticketId: unknown;
      title: unknown;
      notes: unknown;
      assignedAdminId: unknown;
      dueDate: unknown;
    },
    admin: AdminSession,
  ): Promise<WorkOrderRow> {
    const ticketId = Number(input.ticketId);
    if (!Number.isInteger(ticketId) || ticketId <= 0) {
      throw new BadRequestException('ticketId is required.');
    }
    if (typeof input.title !== 'string' || !input.title.trim()) {
      throw new BadRequestException('title is required.');
    }
    if (input.title.trim().length > WORK_ORDER_TITLE_MAX_LENGTH) {
      throw new BadRequestException(
        `title must be ${WORK_ORDER_TITLE_MAX_LENGTH} characters or fewer.`,
      );
    }
    const notes =
      typeof input.notes === 'string' && input.notes.trim()
        ? input.notes.trim()
        : null;
    if (notes && notes.length > WORK_ORDER_NOTES_MAX_LENGTH) {
      throw new BadRequestException(
        `notes must be ${WORK_ORDER_NOTES_MAX_LENGTH} characters or fewer.`,
      );
    }
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
    if (assignedAdminId != null) {
      await this.assertValidAssignee(assignedAdminId, ticket.assignedOffice);
    }

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
      // Origin row for the status timeline. Without it a work order that is
      // never touched again would have no history at all, and the as-of
      // trend query would have nothing to resolve it to. status is read back
      // from the inserted row rather than hardcoded to 'pending' so this
      // stays correct if the column default ever changes.
      await tx.insert(workOrderStatusHistory).values({
        workOrderId: created.id,
        status: created.status,
        adminId: admin.adminId,
        adminName: admin.adminName,
      });
      await this.audit.logInTx(tx, {
        actor: actorFrom(admin),
        actionType: 'work_order_created',
        targetType: 'work_order',
        targetId: created.id,
        targetSummary: `Work order #${created.id} for Ticket #${ticketId}`,
        metadata: {
          ticketId,
          assignedOffice: ticket.assignedOffice,
          hasDueDate: dueDate !== null,
          assignedAdminId,
        },
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

    return row;
  }

  async update(
    id: number,
    input: {
      title: unknown;
      notes: unknown;
      assignedAdminId: unknown;
      dueDate: unknown;
    },
    admin: AdminSession,
  ): Promise<WorkOrderRow> {
    const [existing] = await this.db
      .select(SAFE_COLUMNS)
      .from(workOrders)
      .where(eq(workOrders.id, id));
    if (!existing) throw new NotFoundException('Work order not found.');
    assertOfficeAccess(admin, existing.assigned_office);

    const patch: Partial<typeof workOrders.$inferInsert> = {
      updatedAt: new Date(),
    };
    const changedFields: string[] = [];
    if (input.title !== undefined) {
      if (typeof input.title !== 'string' || !input.title.trim()) {
        throw new BadRequestException('title cannot be empty.');
      }
      if (input.title.trim().length > WORK_ORDER_TITLE_MAX_LENGTH) {
        throw new BadRequestException(
          `title must be ${WORK_ORDER_TITLE_MAX_LENGTH} characters or fewer.`,
        );
      }
      patch.title = input.title.trim();
      changedFields.push('title');
    }
    if (input.notes !== undefined) {
      const notes =
        typeof input.notes === 'string' && input.notes.trim()
          ? input.notes.trim()
          : null;
      if (notes && notes.length > WORK_ORDER_NOTES_MAX_LENGTH) {
        throw new BadRequestException(
          `notes must be ${WORK_ORDER_NOTES_MAX_LENGTH} characters or fewer.`,
        );
      }
      patch.notes = notes;
      changedFields.push('notes');
    }
    if (input.assignedAdminId !== undefined) {
      const assignedAdminId =
        input.assignedAdminId != null ? Number(input.assignedAdminId) : null;
      if (assignedAdminId != null && !Number.isInteger(assignedAdminId)) {
        throw new BadRequestException('assignedAdminId must be an integer.');
      }
      // assigned_office itself is immutable via this endpoint (it's only
      // ever set once, from the ticket, at creation — see create() above),
      // so there is no "office changed" case to reconcile here: the
      // assignee is always validated against the work order's one, fixed
      // office.
      if (assignedAdminId != null) {
        await this.assertValidAssignee(
          assignedAdminId,
          existing.assigned_office,
        );
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
        // Field names only, plus assignedAdminId's own before/after when it
        // changed — bare integer ids, never note bodies or other content.
        metadata: {
          changedFields,
          ...(changedFields.includes('assignedAdminId')
            ? {
                assignedAdminId: {
                  from: existing.assigned_admin_id,
                  to: patch.assignedAdminId,
                },
              }
            : {}),
        },
      });
      return updated;
    });

    return row;
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
    assertOfficeAccess(admin, existing.assigned_office);

    const completedAt = nextStatus === 'completed' ? new Date() : null;

    const row = await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(workOrders)
        .set({ status: nextStatus, completedAt, updatedAt: new Date() })
        .where(eq(workOrders.id, id))
        .returning(SAFE_COLUMNS);
      // Append-only status timeline, in the same transaction as the status
      // write itself so the two can never disagree. This is what makes the
      // dashboard's Pending Work Orders sparkline reconstructable — the
      // work_orders row only ever holds the current status. Distinct from
      // the audit log below, which is System-Administrator-only and keyed on
      // actor, not on the metric.
      await tx.insert(workOrderStatusHistory).values({
        workOrderId: id,
        status: nextStatus,
        adminId: admin.adminId,
        adminName: admin.adminName,
      });
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

    return row;
  }

  // "This week" = the last 7 days, matching the existing dashboard KPI
  // convention (dashboard.service.ts's avg_resolution_hours_30d-style
  // rolling windows), not a calendar-week boundary. Overdue mirrors
  // isOverdue() on the frontend (components/features/admin/work-orders/
  // WorkOrderStatusBadge.tsx): a due date in the past on a work order that
  // hasn't reached a terminal status.
  async getOfficePerformanceCounts(
    office?: 'MEO' | 'MDRRMO',
  ): Promise<WorkOrderPerformanceCounts> {
    const officeFilter = office
      ? eq(workOrders.assignedOffice, office)
      : undefined;
    const countWhere = (...conditions: SQL[]) =>
      this.db
        .select({ count: dsql<number>`count(*)::int` })
        .from(workOrders)
        .where(and(officeFilter, ...conditions));

    const [[pending], [inProgress], [overdue], [completedThisWeek]] =
      await Promise.all([
        countWhere(eq(workOrders.status, 'pending')),
        countWhere(eq(workOrders.status, 'in_progress')),
        countWhere(
          isNotNull(workOrders.dueDate),
          lt(workOrders.dueDate, new Date()),
          dsql`${workOrders.status} NOT IN ('completed', 'cancelled')`,
        ),
        countWhere(
          eq(workOrders.status, 'completed'),
          dsql`${workOrders.completedAt} >= now() - interval '7 days'`,
        ),
      ]);

    return {
      pendingWorkOrders: pending?.count ?? 0,
      inProgressWorkOrders: inProgress?.count ?? 0,
      overdueWorkOrders: overdue?.count ?? 0,
      completedWorkOrdersThisWeek: completedThisWeek?.count ?? 0,
    };
  }

  // "Due today" uses server-local calendar day boundaries — good enough for
  // a single-municipality LGU tool where staff and server share a timezone;
  // ponytail: revisit with a stored timezone if this ever serves multiple
  // timezones.
  async getNeedsAttention(
    office?: 'MEO' | 'MDRRMO',
    limit = 5,
  ): Promise<WorkOrderNeedsAttention> {
    const officeFilter = office
      ? eq(workOrders.assignedOffice, office)
      : undefined;
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const openStatus = inArray(workOrders.status, OPEN_WORK_ORDER_STATUSES);

    const [overdueWorkOrders, dueTodayWorkOrders, highUrgencyRows] =
      await Promise.all([
        this.db
          .select(SAFE_COLUMNS)
          .from(workOrders)
          .where(
            and(
              officeFilter,
              isNotNull(workOrders.dueDate),
              lt(workOrders.dueDate, now),
              openStatus,
            ),
          )
          .orderBy(workOrders.dueDate)
          .limit(limit),
        this.db
          .select(SAFE_COLUMNS)
          .from(workOrders)
          .where(
            and(
              officeFilter,
              isNotNull(workOrders.dueDate),
              gte(workOrders.dueDate, todayStart),
              lt(workOrders.dueDate, tomorrowStart),
              openStatus,
            ),
          )
          .orderBy(workOrders.dueDate)
          .limit(limit),
        this.db
          .select({
            id: tickets.id,
            category: tickets.category,
            assigned_office: tickets.assignedOffice,
            urgency_level: tickets.urgencyLevel,
            priority_score: tickets.priorityScore,
          })
          .from(workOrders)
          .innerJoin(tickets, eq(workOrders.ticketId, tickets.id))
          .where(
            and(
              officeFilter,
              openStatus,
              eq(tickets.urgencyLevel, 'HIGH'),
              inArray(tickets.status, ACTIVE_TICKET_STATUSES),
            ),
          )
          .orderBy(desc(tickets.priorityScore)),
      ]);

    // A ticket can have more than one open work order, so the join above can
    // repeat a ticket id — dedupe in application code rather than reaching
    // for DISTINCT ON, since the result set here is small (dashboard-sized).
    const seen = new Set<number>();
    const highUrgencyTicketsWithOpenWork: HighUrgencyTicketWithOpenWork[] = [];
    for (const row of highUrgencyRows as HighUrgencyTicketWithOpenWork[]) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      highUrgencyTicketsWithOpenWork.push(row);
      if (highUrgencyTicketsWithOpenWork.length >= limit) break;
    }

    return {
      overdueWorkOrders: overdueWorkOrders,
      dueTodayWorkOrders: dueTodayWorkOrders,
      highUrgencyTicketsWithOpenWork,
    };
  }

  // ponytail: capped at 5,000 rows rather than streamed/paginated — same
  // ceiling and rationale as TicketsService.getTicketsForExport.
  async getWorkOrdersForExport(
    filters: WorkOrderFilters & { dateFrom?: Date; dateTo?: Date } = {},
  ): Promise<WorkOrderExportRow[]> {
    const conditions = [
      filters.office
        ? eq(workOrders.assignedOffice, filters.office)
        : undefined,
      filters.status ? eq(workOrders.status, filters.status) : undefined,
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
      filters.dateFrom
        ? gte(workOrders.createdAt, filters.dateFrom)
        : undefined,
      filters.dateTo ? lte(workOrders.createdAt, filters.dateTo) : undefined,
    ].filter((c) => c !== undefined);
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await this.db
      .select({
        id: workOrders.id,
        ticket_id: workOrders.ticketId,
        title: workOrders.title,
        assigned_office: workOrders.assignedOffice,
        assigned_admin_name: dsql<
          string | null
        >`CASE WHEN ${admins.id} IS NULL THEN NULL ELSE ${admins.firstName} || ' ' || ${admins.lastName} END`,
        assigned_admin_email: admins.email,
        status: workOrders.status,
        due_date: workOrders.dueDate,
        completed_at: workOrders.completedAt,
        created_at: workOrders.createdAt,
        updated_at: workOrders.updatedAt,
      })
      .from(workOrders)
      .leftJoin(admins, eq(workOrders.assignedAdminId, admins.id))
      .where(where)
      .orderBy(desc(workOrders.createdAt))
      .limit(5000);

    return rows;
  }
}
