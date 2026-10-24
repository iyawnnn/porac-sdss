import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';
import type { AdminSession } from '../auth/session.service';
import {
  isFocalPersonnel,
  isOperationalPersonnel,
} from '../common/authz/admin-scope';

// The preconditions for staff Merge / Remove / Regroup (manuscript revision
// Phase 3, step 3d; handoff Decisions 1, 2, 11, 12). Pure, so the action
// endpoints (TicketGroupingService) and the "Possibly related tickets"
// panel's enabled/disabled state (RelatedTicketsService) use the very same
// rules and messages.

export const GROUPING_REASON_MAX_LENGTH = 1000;

const ACTIVE_STATUSES = new Set(['Reported', 'Under Review', 'In Progress']);

export interface GroupingTicketFacts {
  id: number;
  status: string;
  assignedOffice: 'MEO' | 'MDRRMO';
  category: string;
  mergedIntoTicketId: number | null;
  // Work Orders still pending or in progress.
  activeWorkOrders: number;
}

export type GroupingActor = Pick<
  AdminSession,
  'accountType' | 'isFocal' | 'office'
>;

export interface GroupingBlock {
  status: 400 | 403 | 409;
  message: string;
}

export function toHttpException(block: GroupingBlock): HttpException {
  if (block.status === 400) return new BadRequestException(block.message);
  if (block.status === 403) return new ForbiddenException(block.message);
  return new ConflictException(block.message);
}

// Who may act (Decision 10's Focal rule): operational Personnel on their own
// office's tickets only; Focal on any office's tickets, but only while every
// ticket involved is still Reported with no active Work Order; the System
// Administrator never.
function actorBlock(
  actor: GroupingActor,
  tickets: GroupingTicketFacts[],
): GroupingBlock | null {
  if (isFocalPersonnel(actor)) {
    for (const t of tickets) {
      if (t.status !== 'Reported') {
        return {
          status: 403,
          message: `Focal Personnel can only merge tickets or move reports while they are still Reported; Ticket #${t.id} is ${t.status}.`,
        };
      }
      if (t.activeWorkOrders > 0) {
        return {
          status: 403,
          message: `Focal Personnel can only merge tickets or move reports before work starts; Ticket #${t.id} has an active Work Order.`,
        };
      }
    }
    return null;
  }
  if (isOperationalPersonnel(actor)) {
    for (const t of tickets) {
      if (t.assignedOffice !== actor.office) {
        return {
          status: 403,
          message: "You do not have access to this office's data.",
        };
      }
    }
    return null;
  }
  return {
    status: 403,
    message:
      'Only MEO, MDRRMO and Focal Personnel can merge tickets or move reports.',
  };
}

function liveBlock(t: GroupingTicketFacts): GroupingBlock | null {
  if (t.mergedIntoTicketId !== null) {
    return {
      status: 409,
      message: `Ticket #${t.id} was already merged into Ticket #${t.mergedIntoTicketId}.`,
    };
  }
  if (!ACTIVE_STATUSES.has(t.status)) {
    return {
      status: 409,
      message: `Ticket #${t.id} is ${t.status}; only active tickets can be merged or have reports moved.`,
    };
  }
  return null;
}

function officeBlock(
  a: GroupingTicketFacts,
  b: GroupingTicketFacts,
): GroupingBlock | null {
  return a.assignedOffice === b.assignedOffice
    ? null
    : {
        status: 409,
        message: `Ticket #${a.id} and Ticket #${b.id} are assigned to different offices. Reassign or Refer first so both tickets have the same office.`,
      };
}

function categoryBlock(
  a: GroupingTicketFacts,
  b: GroupingTicketFacts,
): GroupingBlock | null {
  return a.category === b.category
    ? null
    : {
        status: 409,
        message: `Ticket #${a.id} and Ticket #${b.id} have different categories. Correct the category first.`,
      };
}

// Merge mergedAway into survivor.
export function mergeBlock(
  actor: GroupingActor,
  survivor: GroupingTicketFacts,
  mergedAway: GroupingTicketFacts,
): GroupingBlock | null {
  if (survivor.id === mergedAway.id) {
    return { status: 400, message: 'Choose two different tickets to merge.' };
  }
  return (
    officeBlock(survivor, mergedAway) ??
    actorBlock(actor, [survivor, mergedAway]) ??
    liveBlock(survivor) ??
    liveBlock(mergedAway) ??
    categoryBlock(survivor, mergedAway) ??
    (mergedAway.activeWorkOrders > 0
      ? {
          status: 409,
          message: `Ticket #${mergedAway.id} has an active Work Order. Finish or cancel its Work Orders first.`,
        }
      : null)
  );
}

// Move one report from `from` to `to`. `from`'s Work Orders don't block a
// regroup (only being merged away does), but it must keep a report.
export function regroupBlock(
  actor: GroupingActor,
  from: GroupingTicketFacts,
  to: GroupingTicketFacts,
  fromReportCount: number,
): GroupingBlock | null {
  if (from.id === to.id) {
    return {
      status: 400,
      message: `The report is already on Ticket #${to.id}.`,
    };
  }
  return (
    officeBlock(from, to) ??
    actorBlock(actor, [from, to]) ??
    liveBlock(from) ??
    liveBlock(to) ??
    categoryBlock(from, to) ??
    (fromReportCount < 2
      ? {
          status: 409,
          message: `Ticket #${from.id} would have no reports left. Merge the tickets instead.`,
        }
      : null)
  );
}

// Take one report out of `from` into a new ticket of its own.
export function removeBlock(
  actor: GroupingActor,
  from: GroupingTicketFacts,
  fromReportCount: number,
): GroupingBlock | null {
  return (
    actorBlock(actor, [from]) ??
    liveBlock(from) ??
    (fromReportCount < 2
      ? {
          status: 409,
          message: `Ticket #${from.id} has only this report, so there is nothing to remove it from.`,
        }
      : null)
  );
}

// Required, trimmed, 1-1000 characters.
export function validateGroupingReason(reason: unknown): string {
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    throw new BadRequestException('A reason is required.');
  }
  const trimmed = reason.trim();
  if (trimmed.length > GROUPING_REASON_MAX_LENGTH) {
    throw new BadRequestException(
      `The reason must be ${GROUPING_REASON_MAX_LENGTH} characters or fewer.`,
    );
  }
  return trimmed;
}

export function validateTicketId(value: unknown, field: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestException(`${field} must be a positive integer.`);
  }
  return id;
}

// A merged-away ticket is history: viewable, never changed again.
export function assertNotMergedAway(ticket: {
  id: number;
  merged_into_ticket_id?: number | null;
}): void {
  if (
    ticket.merged_into_ticket_id !== null &&
    ticket.merged_into_ticket_id !== undefined
  ) {
    throw new ConflictException(
      `Ticket #${ticket.id} was merged into Ticket #${ticket.merged_into_ticket_id} and is read-only.`,
    );
  }
}
