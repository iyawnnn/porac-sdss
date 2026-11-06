import { EXPORT_ROW_LIMIT, assertExportLimit } from './export-limit';
import {
  BadRequestException,
  ConflictException,
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
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core';
import { DB } from '../db/db.module';
import {
  admins,
  operationalAssessments,
  tickets,
  workOrders,
  workOrderStatusHistory,
} from '../db/schema';
import type { AdminSession } from '../auth/session.service';
import {
  resolveOfficeScope,
  assertOfficeAccess,
  isOperationalPersonnel,
} from '../common/authz/admin-scope';
import { NotificationsService } from '../notifications/notifications.service';
import { AdminAuditService } from './admin-audit.service';
import {
  ASSESSMENT_REQUIRED_MESSAGE,
  OPEN_WORK_ORDER_STATUSES,
  WORK_ORDER_STATUSES,
  assertResponsibleOfficeCanAct,
  assertWorkOrderNotFinal,
  assertWorkOrderTransition,
  isFinalWorkOrder,
  pgErrorInfo,
  type ResponsibleTicketFacts,
  type WorkOrderStatus,
} from './work-order.rules';
import {
  WORK_ORDER_TITLE_MAX_LENGTH,
  WORK_ORDER_NOTES_MAX_LENGTH,
  WORK_ORDER_CANCELLATION_REASON_MAX_LENGTH,
} from '../contracts/schemas';

export type { WorkOrderStatus } from './work-order.rules';

// Timestamps go to the database as ISO strings cast to timestamptz, never
// as JS Date objects (the Phase 4c lesson; the unit-test fake rejects Date).
function ts(iso: string) {
  return dsql`${iso}::timestamptz`;
}

// A due date from the request as an ISO string, or null when cleared.
function parseDueDate(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('dueDate is not a valid date.');
  }
  return date.toISOString();
}

// The write guard every Work Order UPDATE carries on top of the locked
// pre-checks: its ticket is still not merged away and not Rejected.
const TICKET_STILL_WRITABLE = dsql`EXISTS (
  SELECT 1 FROM tickets t
  WHERE t.id = ${workOrders.ticketId}
    AND t.merged_into_ticket_id IS NULL
    AND t.status <> 'Rejected'
)`;

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
  // Manuscript revision Phase 5, step 5b (staff only, like the whole row).
  // A Work Order cancelled before 5b has status 'cancelled' and all four
  // NULL ("No reason recorded (legacy)").
  cancellation_reason: string | null;
  cancelled_by_admin_id: number | null;
  cancelled_by_name: string | null;
  cancelled_at: Date | null;
  replacement_work_order_id: number | null;
}

// The list query's own row shape — adds the linked ticket's already-computed
// Operational Priority (priority_index, never recomputed here) so the
// workspace can show it per row without opening the ticket. It carried the
// Hazard Urgency score until manuscript revision Phase 1, step 6a.
// get/create/update/setStatus return plain WorkOrderRow; only list() joins
// tickets for this.
export interface WorkOrderListRow extends WorkOrderRow {
  priority_index: number | null;
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
  workOrders: WorkOrderListRow[];
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

// Feeds the dashboard's "Needs Attention" section — small, office-scoped
// lists (never counts-only like WorkOrderPerformanceCounts) surfacing what
// an office should look at next: overdue work and due-today work. The
// Hazard Urgency list (tickets with open work) was removed in manuscript
// revision Phase 1, step 6a.
export interface WorkOrderNeedsAttention {
  overdueWorkOrders: WorkOrderRow[];
  dueTodayWorkOrders: WorkOrderRow[];
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
  cancelled_at: Date | null;
  cancellation_reason: string | null;
  replacement_work_order_id: number | null;
  created_at: Date;
  updated_at: Date;
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
  cancellation_reason: workOrders.cancellationReason,
  cancelled_by_admin_id: workOrders.cancelledByAdminId,
  // The canceller's current name, for "Cancelled by … on …" on the final
  // Work Order card.
  cancelled_by_name: dsql<
    string | null
  >`(SELECT a.first_name || ' ' || a.last_name FROM admins a WHERE a.id = ${workOrders.cancelledByAdminId})`,
  cancelled_at: workOrders.cancelledAt,
  replacement_work_order_id: workOrders.replacementWorkOrderId,
};

// list()-only column set: SAFE_COLUMNS plus the linked ticket's Operational
// Priority, joined in rather than recomputed. Not used by
// get/create/update/setStatus, which don't need it.
const LIST_COLUMNS = {
  ...SAFE_COLUMNS,
  priority_index: tickets.priorityIndex,
};

const PAGE_LIMITS = [10, 15, 25, 50] as const;
const DEFAULT_PAGE_LIMIT = 15;

function actorFrom(admin: AdminSession) {
  return {
    adminId: admin.adminId,
    adminName: admin.adminName,
    email: admin.email,
    accountType: admin.accountType,
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

  // A work order's assignee must be an active operational Personnel
  // account (PERSONNEL, not Focal) on *this* work order's office — never the
  // caller's own office, since a System Administrator's office is null and
  // an operational caller's is already guaranteed to match by
  // assertOfficeAccess before this runs. The office alone is not enough:
  // Focal Personnel carries office 'MDRRMO' but is intake-only and never an
  // assignee, so the same isOperationalPersonnel allowlist the assignee
  // picker uses (AdminsService.listDirectory) applies here. This is the one
  // place that would let a cross-office or non-operational account leak
  // into assigned_admin_id if skipped.
  private async assertValidAssignee(
    assignedAdminId: number,
    office: 'MEO' | 'MDRRMO',
    db: PostgresJsDatabase = this.db,
  ): Promise<void> {
    const [assignee] = await db
      .select({
        office: admins.office,
        isActive: admins.isActive,
        accountType: admins.accountType,
        isFocal: admins.isFocal,
      })
      .from(admins)
      .where(eq(admins.id, assignedAdminId));
    if (
      !assignee ||
      !assignee.isActive ||
      !isOperationalPersonnel(assignee) ||
      assignee.office !== office
    ) {
      throw new BadRequestException(
        'assignedAdminId must be an active Personnel account belonging to this office.',
      );
    }
  }

  // Reads the Work Order's ticket and locks its row for the rest of the
  // transaction, so a concurrent Reject, Merge or Reassign (each of which
  // updates the tickets row) can't slip between these checks and the write.
  // Reads merged_into_ticket_id rather than filtering on it: a merged-away
  // ticket must answer 409 (read-only history), not 404.
  private async lockTicket(
    tx: PostgresJsDatabase,
    ticketId: number,
  ): Promise<ResponsibleTicketFacts> {
    const [ticket] = await tx
      .select({
        id: tickets.id,
        status: tickets.status,
        assigned_office: tickets.assignedOffice,
        merged_into_ticket_id: tickets.mergedIntoTicketId,
      })
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .for('update');
    if (!ticket) throw new NotFoundException('Ticket not found.');
    return ticket;
  }

  private async lockWorkOrder(
    tx: PostgresJsDatabase,
    id: number,
  ): Promise<WorkOrderRow> {
    const [row] = await tx
      .select(SAFE_COLUMNS)
      .from(workOrders)
      .where(eq(workOrders.id, id))
      .for('update', { of: workOrders });
    if (!row) throw new NotFoundException('Work order not found.');
    return row;
  }

  // Constraint violations from migration 0045 (and the FKs) as clean 400/409
  // answers instead of a 500. The service checks every one of these first,
  // so reaching here means a race or a direct-SQL edge case.
  private mapConstraintError(err: unknown, workOrderId?: number): never {
    const { code, constraint } = pgErrorInfo(err);
    const which = workOrderId ? `Work Order #${workOrderId}` : 'The Work Order';
    if (code === '23503') {
      if (constraint === 'work_orders_replacement_same_ticket_fkey') {
        throw new BadRequestException(
          'The replacement must be a Work Order of the same ticket.',
        );
      }
      throw new BadRequestException(
        `${which} refers to a record that does not exist.`,
      );
    }
    if (code === '23514') {
      throw new ConflictException(
        `${which} could not be saved: it would break the rule ${constraint ?? 'on Work Orders'}.`,
      );
    }
    throw err;
  }

  parseQuery(
    query: Record<string, string | undefined>,
    admin: Pick<AdminSession, 'accountType' | 'isFocal' | 'office' | 'adminId'>,
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
        .select(LIST_COLUMNS)
        .from(workOrders)
        // Every work order FKs to a ticket (see migrate:work-orders), so an
        // inner join never drops a row — same join TicketsService/
        // getNeedsAttention already use for this table pair.
        .innerJoin(tickets, eq(workOrders.ticketId, tickets.id))
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
    admin: Pick<AdminSession, 'accountType' | 'isFocal' | 'office'>,
  ): Promise<WorkOrderRow> {
    const [row] = await this.db
      .select(SAFE_COLUMNS)
      .from(workOrders)
      .where(eq(workOrders.id, id));
    if (!row) throw new NotFoundException('Work order not found.');
    assertOfficeAccess(admin, row.assigned_office);
    return row;
  }

  // One work order per selected ticket, sharing the same title/notes/
  // assignee/due date. Loops create() rather than batch-inserting so each
  // work order gets the identical office check, work_order_status_history
  // origin row and audit entry a single create() writes. Partial success is
  // reported, never rolled back — see BulkActionResult in tickets.service.ts.
  async bulkCreate(
    ticketIds: number[],
    input: {
      title: unknown;
      notes: unknown;
      assignedAdminId: unknown;
      dueDate: unknown;
    },
    admin: AdminSession,
  ): Promise<{ ok: number[]; skipped: { id: number; reason: string }[] }> {
    const ok: number[] = [];
    const skipped: { id: number; reason: string }[] = [];
    for (const ticketId of ticketIds) {
      try {
        await this.create({ ...input, ticketId }, admin);
        ok.push(ticketId);
      } catch (err) {
        skipped.push({
          id: ticketId,
          reason:
            err instanceof Error && err.message
              ? err.message
              : 'Could not create a work order.',
        });
      }
    }
    return { ok, skipped };
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
    const dueDate = parseDueDate(input.dueDate);

    // Every creation path (this, bulkCreate, the demo seed) comes through
    // here, so the manuscript rules (p. 45) hold everywhere: the ticket's
    // current responsible office only, never on a merged-away or Rejected
    // ticket, and only once the ticket has an Operational Assessment with
    // observed conditions. Tickets that already had Work Orders without an
    // assessment keep them; the rule is for new ones.
    const { row, office } = await this.db.transaction(async (tx) => {
      const ticket = await this.lockTicket(tx, ticketId);
      assertResponsibleOfficeCanAct(admin, ticket, 'Work Orders');
      const [assessment] = await tx
        .select({ id: operationalAssessments.id })
        .from(operationalAssessments)
        .where(
          and(
            eq(operationalAssessments.ticketId, ticketId),
            dsql`btrim(${operationalAssessments.observedConditions}) <> ''`,
          ),
        );
      if (!assessment) {
        throw new ConflictException(ASSESSMENT_REQUIRED_MESSAGE);
      }
      if (assignedAdminId != null) {
        await this.assertValidAssignee(
          assignedAdminId,
          ticket.assigned_office,
          tx,
        );
      }

      const [created] = await tx
        .insert(workOrders)
        .values({
          ticketId,
          title: input.title as string,
          notes,
          assignedOffice: ticket.assigned_office,
          assignedAdminId,
          createdByAdminId: admin.adminId,
          dueDate: dueDate ? ts(dueDate) : null,
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
          assignedOffice: ticket.assigned_office,
          hasDueDate: dueDate !== null,
          assignedAdminId,
        },
      });
      return { row: created, office: ticket.assigned_office };
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
        recipientOffice: office,
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

  // Edits title / notes / assignee / due date. Only while the Work Order is
  // pending or in progress (Completed and Cancelled are final for every
  // field), by the ticket's current responsible office, and never on a
  // merged-away or Rejected ticket.
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
    try {
      return await this.db.transaction(async (tx) => {
        const existing = await this.lockWorkOrder(tx, id);
        const ticket = await this.lockTicket(tx, existing.ticket_id);
        assertResponsibleOfficeCanAct(admin, ticket, 'Work Orders');
        assertWorkOrderNotFinal(existing);

        const patch: PgUpdateSetSource<typeof workOrders> = {
          updatedAt: ts(new Date().toISOString()),
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
            input.assignedAdminId != null
              ? Number(input.assignedAdminId)
              : null;
          if (assignedAdminId != null && !Number.isInteger(assignedAdminId)) {
            throw new BadRequestException(
              'assignedAdminId must be an integer.',
            );
          }
          // assigned_office itself is immutable via this endpoint (it's only
          // ever set once, from the ticket, at creation — see create()
          // above), so there is no "office changed" case to reconcile here:
          // the assignee is always validated against the work order's one,
          // fixed office.
          if (assignedAdminId != null) {
            await this.assertValidAssignee(
              assignedAdminId,
              existing.assigned_office,
              tx,
            );
          }
          patch.assignedAdminId = assignedAdminId;
          changedFields.push('assignedAdminId');
        }
        if (input.dueDate !== undefined) {
          const dueDate = parseDueDate(input.dueDate);
          patch.dueDate = dueDate ? ts(dueDate) : null;
          changedFields.push('dueDate');
        }

        const [updated] = await tx
          .update(workOrders)
          .set(patch)
          .where(
            and(
              eq(workOrders.id, id),
              inArray(workOrders.status, OPEN_WORK_ORDER_STATUSES),
              TICKET_STILL_WRITABLE,
            ),
          )
          .returning(SAFE_COLUMNS);
        if (!updated) {
          throw new ConflictException(
            `Work Order #${id} changed while it was being saved; reload and try again.`,
          );
        }
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
    } catch (err) {
      this.mapConstraintError(err, id);
    }
  }

  // pending -> in_progress -> completed (manuscript Table 4). Completing
  // sets completed_at and never touches the ticket's own status. A request
  // for 'cancelled' goes to cancel(), which needs a reason.
  async setStatus(
    id: number,
    status: unknown,
    admin: AdminSession,
    cancellation: { reason?: unknown; replacementWorkOrderId?: unknown } = {},
  ): Promise<WorkOrderRow> {
    if (!WORK_ORDER_STATUSES.includes(status as WorkOrderStatus)) {
      throw new BadRequestException(
        `status must be one of ${WORK_ORDER_STATUSES.join(', ')}.`,
      );
    }
    const nextStatus = status as WorkOrderStatus;
    if (nextStatus === 'cancelled') {
      return this.cancel(id, cancellation, admin);
    }

    try {
      return await this.db.transaction(async (tx) => {
        const existing = await this.lockWorkOrder(tx, id);
        const ticket = await this.lockTicket(tx, existing.ticket_id);
        assertResponsibleOfficeCanAct(admin, ticket, 'Work Orders');
        assertWorkOrderNotFinal(existing);
        assertWorkOrderTransition(existing, nextStatus);

        const now = new Date().toISOString();
        const [updated] = await tx
          .update(workOrders)
          .set({
            status: nextStatus,
            completedAt: nextStatus === 'completed' ? ts(now) : null,
            updatedAt: ts(now),
          })
          .where(
            and(
              eq(workOrders.id, id),
              eq(workOrders.status, existing.status),
              TICKET_STILL_WRITABLE,
            ),
          )
          .returning(SAFE_COLUMNS);
        if (!updated) {
          throw new ConflictException(
            `Work Order #${id} changed while it was being saved; reload and try again.`,
          );
        }
        // Append-only status timeline, in the same transaction as the status
        // write itself so the two can never disagree. This is what makes the
        // dashboard's Pending Work Orders sparkline reconstructable — the
        // work_orders row only ever holds the current status. Distinct from
        // the audit log below, which is System-Administrator-only and keyed
        // on actor, not on the metric.
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
              : 'work_order_status_changed',
          targetType: 'work_order',
          targetId: id,
          targetSummary: `Work order #${id} for Ticket #${existing.ticket_id}`,
          metadata: { from: existing.status, to: nextStatus },
        });
        return updated;
      });
    } catch (err) {
      this.mapConstraintError(err, id);
    }
  }

  // Cancel a pending or in-progress Work Order (manuscript Table 4,
  // Appendix H WORK_ORDERS): a required reason, who and when, and optionally
  // the Work Order of the same ticket that replaces it. One UPDATE sets all
  // of them, so work_orders_cancellation_check holds. Never touches the
  // ticket's status.
  async cancel(
    id: number,
    input: { reason?: unknown; replacementWorkOrderId?: unknown },
    admin: AdminSession,
  ): Promise<WorkOrderRow> {
    const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
    if (!reason) {
      throw new BadRequestException('A cancellation reason is required.');
    }
    if (reason.length > WORK_ORDER_CANCELLATION_REASON_MAX_LENGTH) {
      throw new BadRequestException(
        `The cancellation reason must be ${WORK_ORDER_CANCELLATION_REASON_MAX_LENGTH} characters or fewer.`,
      );
    }
    let replacementId: number | null = null;
    if (
      input.replacementWorkOrderId !== undefined &&
      input.replacementWorkOrderId !== null &&
      input.replacementWorkOrderId !== ''
    ) {
      replacementId = Number(input.replacementWorkOrderId);
      if (!Number.isInteger(replacementId) || replacementId <= 0) {
        throw new BadRequestException(
          'replacementWorkOrderId must be a Work Order id.',
        );
      }
      if (replacementId === id) {
        throw new BadRequestException(
          'A Work Order cannot be its own replacement.',
        );
      }
    }

    try {
      return await this.db.transaction(async (tx) => {
        const existing = await this.lockWorkOrder(tx, id);
        const ticket = await this.lockTicket(tx, existing.ticket_id);
        assertResponsibleOfficeCanAct(admin, ticket, 'Work Orders');
        assertWorkOrderNotFinal(existing);
        assertWorkOrderTransition(existing, 'cancelled');

        if (replacementId !== null) {
          const [replacement] = await tx
            .select({
              id: workOrders.id,
              ticket_id: workOrders.ticketId,
              status: workOrders.status,
            })
            .from(workOrders)
            .where(eq(workOrders.id, replacementId));
          if (!replacement) {
            throw new BadRequestException(
              `Replacement Work Order #${replacementId} was not found.`,
            );
          }
          if (replacement.ticket_id !== existing.ticket_id) {
            throw new BadRequestException(
              `Replacement Work Order #${replacementId} belongs to another ticket; choose one of Ticket #${existing.ticket_id}.`,
            );
          }
          if (isFinalWorkOrder(replacement.status)) {
            throw new ConflictException(
              `Replacement Work Order #${replacementId} is ${replacement.status}; choose a pending or in-progress Work Order.`,
            );
          }
        }

        const now = new Date().toISOString();
        const [updated] = await tx
          .update(workOrders)
          .set({
            status: 'cancelled',
            cancellationReason: reason,
            cancelledByAdminId: admin.adminId,
            cancelledAt: ts(now),
            replacementWorkOrderId: replacementId,
            completedAt: null,
            updatedAt: ts(now),
          })
          .where(
            and(
              eq(workOrders.id, id),
              inArray(workOrders.status, OPEN_WORK_ORDER_STATUSES),
              TICKET_STILL_WRITABLE,
            ),
          )
          .returning(SAFE_COLUMNS);
        if (!updated) {
          throw new ConflictException(
            `Work Order #${id} changed while it was being saved; reload and try again.`,
          );
        }
        await tx.insert(workOrderStatusHistory).values({
          workOrderId: id,
          status: 'cancelled',
          adminId: admin.adminId,
          adminName: admin.adminName,
        });
        await this.audit.logInTx(tx, {
          actor: actorFrom(admin),
          actionType: 'work_order_cancelled',
          targetType: 'work_order',
          targetId: id,
          targetSummary: `Work order #${id} for Ticket #${existing.ticket_id}`,
          metadata: {
            from: existing.status,
            to: 'cancelled',
            reason,
            ...(replacementId !== null
              ? { replacementWorkOrderId: replacementId }
              : {}),
          },
        });
        return updated;
      });
    } catch (err) {
      this.mapConstraintError(err, id);
    }
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
        .where(
          and(
            officeFilter,
            dsql`EXISTS (SELECT 1 FROM tickets t WHERE t.id=${workOrders.ticketId} AND t.merged_into_ticket_id IS NULL)`,
            ...conditions,
          ),
        );

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

    const [overdueWorkOrders, dueTodayWorkOrders] = await Promise.all([
      this.db
        .select(SAFE_COLUMNS)
        .from(workOrders)
        .where(
          and(
            officeFilter,
            dsql`EXISTS (SELECT 1 FROM tickets t WHERE t.id=${workOrders.ticketId} AND t.merged_into_ticket_id IS NULL)`,
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
            dsql`EXISTS (SELECT 1 FROM tickets t WHERE t.id=${workOrders.ticketId} AND t.merged_into_ticket_id IS NULL)`,
            isNotNull(workOrders.dueDate),
            gte(workOrders.dueDate, todayStart),
            lt(workOrders.dueDate, tomorrowStart),
            openStatus,
          ),
        )
        .orderBy(workOrders.dueDate)
        .limit(limit),
    ]);

    return {
      overdueWorkOrders: overdueWorkOrders,
      dueTodayWorkOrders: dueTodayWorkOrders,
    };
  }

  // Fetch one extra row so overflow is refused, never silently truncated.
  async getWorkOrdersForExport(
    filters: WorkOrderFilters & { dateFrom?: Date; dateTo?: Date } = {},
  ): Promise<WorkOrderExportRow[]> {
    const conditions = [
      dsql`${tickets.mergedIntoTicketId} IS NULL`,
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
        cancelled_at: workOrders.cancelledAt,
        cancellation_reason: workOrders.cancellationReason,
        replacement_work_order_id: workOrders.replacementWorkOrderId,
        created_at: workOrders.createdAt,
        updated_at: workOrders.updatedAt,
      })
      .from(workOrders)
      .innerJoin(tickets, eq(workOrders.ticketId, tickets.id))
      .leftJoin(admins, eq(workOrders.assignedAdminId, admins.id))
      .where(where)
      .orderBy(desc(workOrders.createdAt))
      .limit(EXPORT_ROW_LIMIT + 1);

    assertExportLimit(rows);
    return rows;
  }
}
