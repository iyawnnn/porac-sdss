import { ConflictException } from '@nestjs/common';
import type { AdminSession } from '../auth/session.service';
import { assertOfficeAccess } from '../common/authz/admin-scope';
import { assertNotMergedAway } from './ticket-grouping.rules';

// Work Order and Operational Assessment rules (manuscript pp. 44-45,
// Appendix H WORK_ORDERS / OPERATIONAL_ASSESSMENTS, Tables 3-4; manuscript
// revision Phase 5, step 5b). Pure, so WorkOrdersService,
// OperationalAssessmentService and their tests share the same rules and
// messages.

export type WorkOrderStatus =
  'pending' | 'in_progress' | 'completed' | 'cancelled';

export const WORK_ORDER_STATUSES: WorkOrderStatus[] = [
  'pending',
  'in_progress',
  'completed',
  'cancelled',
];

// "Active" everywhere else in the app (merge, correction and routing
// safeguards, dashboard counts) means exactly these two.
export const OPEN_WORK_ORDER_STATUSES = ['pending', 'in_progress'] as const;

// Completed and Cancelled are final: no status change, no edit of any field.
export const FINAL_WORK_ORDER_STATUSES: WorkOrderStatus[] = [
  'completed',
  'cancelled',
];

// pending -> in_progress -> completed; pending or in_progress -> cancelled.
// Nothing else: no going backwards and no pending -> completed directly.
export const WORK_ORDER_TRANSITIONS: Record<
  WorkOrderStatus,
  WorkOrderStatus[]
> = {
  pending: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export const ASSESSMENT_REQUIRED_MESSAGE =
  'Add an Operational Assessment first.';

const STATUS_LABEL: Record<WorkOrderStatus, string> = {
  pending: 'pending',
  in_progress: 'in progress',
  completed: 'completed',
  cancelled: 'cancelled',
};

export function isFinalWorkOrder(status: WorkOrderStatus): boolean {
  return FINAL_WORK_ORDER_STATUSES.includes(status);
}

// 409 for any change to a Completed or Cancelled Work Order.
export function assertWorkOrderNotFinal(workOrder: {
  id: number;
  status: WorkOrderStatus;
}): void {
  if (isFinalWorkOrder(workOrder.status)) {
    throw new ConflictException(
      `Work Order #${workOrder.id} is ${STATUS_LABEL[workOrder.status]} and final; it can no longer be changed.`,
    );
  }
}

// 409 naming both statuses for anything outside WORK_ORDER_TRANSITIONS.
// Checked after assertWorkOrderNotFinal, so a final Work Order gets the
// "final" message instead.
export function assertWorkOrderTransition(
  workOrder: { id: number; status: WorkOrderStatus },
  next: WorkOrderStatus,
): void {
  if (!WORK_ORDER_TRANSITIONS[workOrder.status].includes(next)) {
    throw new ConflictException(
      `Work Order #${workOrder.id} cannot move from ${STATUS_LABEL[workOrder.status]} to ${STATUS_LABEL[next]}.`,
    );
  }
}

export interface ResponsibleTicketFacts {
  id: number;
  status: string;
  assigned_office: 'MEO' | 'MDRRMO';
  merged_into_ticket_id: number | null;
}

// Who may create, edit, complete or cancel a ticket's Work Orders, or write
// its assessment: MEO / MDRRMO Personnel of the ticket's CURRENT responsible
// office only (403 otherwise — Focal Personnel and the System Administrator
// included), and never on a merged-away (read-only history) or Rejected
// ticket (409). Order: 403 before 409, as everywhere else.
export function assertResponsibleOfficeCanAct(
  admin: Pick<AdminSession, 'accountType' | 'isFocal' | 'office'>,
  ticket: ResponsibleTicketFacts,
  what: 'Work Orders' | 'Operational Assessment',
): void {
  assertOfficeAccess(admin, ticket.assigned_office);
  assertNotMergedAway(ticket);
  if (ticket.status === 'Rejected') {
    throw new ConflictException(
      what === 'Work Orders'
        ? `Ticket #${ticket.id} is Rejected; its Work Orders can no longer be created or changed.`
        : `Ticket #${ticket.id} is Rejected; its Operational Assessment can no longer be changed.`,
    );
  }
}

// postgres.js errors arrive bare from raw SQL and wrapped (cause) from
// Drizzle; the SQLSTATE and constraint name are on whichever carries them.
export function pgErrorInfo(err: unknown): {
  code?: string;
  constraint?: string;
} {
  const candidates = [err, (err as { cause?: unknown } | null)?.cause];
  for (const c of candidates) {
    if (c && typeof c === 'object' && 'code' in c) {
      const e = c as { code?: unknown; constraint_name?: unknown };
      if (typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code)) {
        return {
          code: e.code,
          constraint:
            typeof e.constraint_name === 'string'
              ? e.constraint_name
              : undefined,
        };
      }
    }
  }
  return {};
}
