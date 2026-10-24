import { BadRequestException } from '@nestjs/common';
import type { AdminSession } from '../auth/session.service';
import {
  isFocalPersonnel,
  isOperationalPersonnel,
} from '../common/authz/admin-scope';
import { officeForCategory } from '../common/utils/office';
import { CATEGORIES } from '../contracts/schemas';
import type {
  GroupingBlock,
  GroupingTicketFacts,
} from './ticket-grouping.rules';

// The preconditions for staff category and location correction (manuscript
// pp. 42–45, Tables 2–4; manuscript revision Phase 3, step 3e). Pure, so
// the correction endpoints and the enabled/disabled state of the buttons
// (GET /admin/ticket-corrections/:id) use the very same rules and messages.
// Same people as the step 3d grouping actions; the reason rule is shared
// too (validateGroupingReason).

export type CorrectionTicketFacts = GroupingTicketFacts;
export type CorrectionActor = Pick<
  AdminSession,
  'accountType' | 'isFocal' | 'office'
>;
export type CorrectionBlock = GroupingBlock;

const ACTIVE_STATUSES = new Set(['Reported', 'Under Review', 'In Progress']);

// A staff correction may move a ticket at most this close to where it is
// and still count as the same place.
export const SAME_LOCATION_M = 1;

// Who may correct (as for grouping, Decision 10's Focal rule): operational
// Personnel on their own office's tickets; Focal on any office's ticket
// while it is still Reported with no active Work Order; the System
// Administrator never. Then the ticket must be active and not merged away.
export function correctionBlock(
  actor: CorrectionActor,
  ticket: CorrectionTicketFacts,
): CorrectionBlock | null {
  if (isFocalPersonnel(actor)) {
    if (ticket.status !== 'Reported') {
      return {
        status: 403,
        message: `Focal Personnel can only correct a ticket while it is still Reported; Ticket #${ticket.id} is ${ticket.status}.`,
      };
    }
    if (ticket.activeWorkOrders > 0) {
      return {
        status: 403,
        message: `Focal Personnel can only correct a ticket before work starts; Ticket #${ticket.id} has an active Work Order.`,
      };
    }
  } else if (isOperationalPersonnel(actor)) {
    if (ticket.assignedOffice !== actor.office) {
      return {
        status: 403,
        message: "You do not have access to this office's data.",
      };
    }
  } else {
    return {
      status: 403,
      message: 'Only MEO, MDRRMO and Focal Personnel can correct a ticket.',
    };
  }
  if (ticket.mergedIntoTicketId !== null) {
    return {
      status: 409,
      message: `Ticket #${ticket.id} was merged into Ticket #${ticket.mergedIntoTicketId} and is read-only.`,
    };
  }
  if (!ACTIVE_STATUSES.has(ticket.status)) {
    return {
      status: 409,
      message: `Ticket #${ticket.id} is ${ticket.status}; only active tickets can be corrected.`,
    };
  }
  return null;
}

// A category that belongs to the other office moves the ticket there (a
// Reassign in the same transaction), which is blocked while it has a
// pending or in-progress Work Order (group decision). Completed and
// cancelled Work Orders stay as history and don't block.
export function officeChangeBlock(
  ticket: CorrectionTicketFacts,
): CorrectionBlock | null {
  return ticket.activeWorkOrders > 0
    ? {
        status: 409,
        message: `Ticket #${ticket.id} has an active Work Order, and the new category belongs to the other office. Finish or cancel the Work Orders first.`,
      }
    : null;
}

export function categoryCorrectionBlock(
  actor: CorrectionActor,
  ticket: CorrectionTicketFacts,
  newCategory: string,
): CorrectionBlock | null {
  return (
    correctionBlock(actor, ticket) ??
    (newCategory === ticket.category
      ? {
          status: 400,
          message: `Ticket #${ticket.id} already has the category ${newCategory}.`,
        }
      : null) ??
    (officeForCategory(newCategory) !== ticket.assignedOffice
      ? officeChangeBlock(ticket)
      : null)
  );
}

// One of the current categories: a legacy name is never a correction.
export function validateCorrectionCategory(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !(CATEGORIES as readonly string[]).includes(value)
  ) {
    throw new BadRequestException('Choose one of the current categories.');
  }
  return value;
}

export function validateCorrectionPoint(
  lat: unknown,
  lng: unknown,
): { lat: number; lng: number } {
  const la = typeof lat === 'string' ? Number(lat) : lat;
  const ln = typeof lng === 'string' ? Number(lng) : lng;
  if (
    typeof la !== 'number' ||
    typeof ln !== 'number' ||
    !Number.isFinite(la) ||
    !Number.isFinite(ln) ||
    Math.abs(la) > 90 ||
    Math.abs(ln) > 180
  ) {
    throw new BadRequestException('Choose a point on the map.');
  }
  return { lat: la, lng: ln };
}
