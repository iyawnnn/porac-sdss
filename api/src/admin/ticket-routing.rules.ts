import { BadRequestException } from '@nestjs/common';
import type { AdminSession } from '../auth/session.service';
import {
  isFocalPersonnel,
  isOperationalPersonnel,
} from '../common/authz/admin-scope';
import { REFERRAL_AGENCY_MAX_LENGTH } from '../contracts/schemas';
import type { GroupingBlock } from './ticket-grouping.rules';

// The rules for manual routing (manuscript pp. 43–44, Appendix H
// ROUTING_ACTIONS; manuscript revision Phase 5, step 5a; handoff Decisions
// 10 and 12). Manual routing is only REASSIGN (to the other office) or
// REFER (to an external agency); automatic Initial Routing stays in
// tickets.initial_assigned_office. Pure, so the routing endpoints and the
// enabled/disabled state of the Reassign and Refer buttons (Ticket Detail,
// Focal intake detail) use the very same rules and messages.

export const ROUTING_REASON_MAX_LENGTH = 1000;

export interface RoutingTicketFacts {
  id: number;
  status: string;
  assignedOffice: 'MEO' | 'MDRRMO';
  mergedIntoTicketId: number | null;
  // Work Orders still pending or in progress.
  activeWorkOrders: number;
}

export type RoutingActor = Pick<
  AdminSession,
  'accountType' | 'isFocal' | 'office'
>;
export type RoutingBlock = GroupingBlock;

// Who may route, and when — the same for Reassign and Refer:
// - Focal Personnel, on any office's ticket, only while it is still
//   Reported with no active Work Order (Decision 10). After that the
//   responsible office handles routing corrections.
// - MEO / MDRRMO Personnel, on their own office's tickets.
// - The System Administrator never.
// Then, for everyone: never a merged-away ticket (read-only history), never
// a Rejected one, and never while a Work Order is pending or in progress.
// A Resolved ticket stays routable by its office, as before this step.
export function routingBlock(
  actor: RoutingActor,
  ticket: RoutingTicketFacts,
): RoutingBlock | null {
  if (isFocalPersonnel(actor)) {
    if (ticket.status !== 'Reported') {
      return {
        status: 403,
        message: `Focal Personnel can only reassign or refer a ticket while it is still Reported; Ticket #${ticket.id} is ${ticket.status}. The responsible office handles routing from here.`,
      };
    }
    if (ticket.activeWorkOrders > 0) {
      return {
        status: 403,
        message: `Focal Personnel can only reassign or refer a ticket before work starts; Ticket #${ticket.id} has an active Work Order. The responsible office handles routing from here.`,
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
      message:
        'Only MEO, MDRRMO and Focal Personnel can reassign or refer a ticket.',
    };
  }
  if (ticket.mergedIntoTicketId !== null) {
    return {
      status: 409,
      message: `Ticket #${ticket.id} was merged into Ticket #${ticket.mergedIntoTicketId} and is read-only.`,
    };
  }
  if (ticket.status === 'Rejected') {
    return {
      status: 409,
      message: `Ticket #${ticket.id} is Rejected and can no longer be reassigned or referred.`,
    };
  }
  if (ticket.activeWorkOrders > 0) {
    return {
      status: 409,
      message: `Ticket #${ticket.id} has an active Work Order. Finish or cancel its Work Orders before reassigning or referring it.`,
    };
  }
  return null;
}

// A Reassign to the office that already holds the ticket changes nothing.
export function reassignDestinationBlock(
  ticket: Pick<RoutingTicketFacts, 'id' | 'assignedOffice'>,
  toOffice: 'MEO' | 'MDRRMO',
): RoutingBlock | null {
  return ticket.assignedOffice === toOffice
    ? {
        status: 400,
        message: `Ticket #${ticket.id} is already assigned to ${toOffice}.`,
      }
    : null;
}

// Refer to the agency the ticket's latest routing action already referred
// it to changes nothing either. latestRouting is the ticket's newest
// routing_actions row, if any; a Reassign since that referral makes a new
// referral to the same agency a real one again.
export function referDestinationBlock(
  ticket: Pick<RoutingTicketFacts, 'id'>,
  agency: string,
  latestRouting: {
    actionType: 'REASSIGN' | 'REFER';
    referralTarget: string | null;
  } | null,
): RoutingBlock | null {
  return latestRouting?.actionType === 'REFER' &&
    latestRouting.referralTarget !== null &&
    sameAgency(latestRouting.referralTarget, agency)
    ? {
        status: 400,
        message: `Ticket #${ticket.id} is already referred to ${latestRouting.referralTarget}.`,
      }
    : null;
}

function sameAgency(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// Required, trimmed, 1-1000 characters — for Reassign and Refer alike.
export function validateRoutingReason(reason: unknown): string {
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    throw new BadRequestException('A reason is required.');
  }
  const trimmed = reason.trim();
  if (trimmed.length > ROUTING_REASON_MAX_LENGTH) {
    throw new BadRequestException(
      `The reason must be ${ROUTING_REASON_MAX_LENGTH} characters or fewer.`,
    );
  }
  return trimmed;
}

export function validateReassignOffice(value: unknown): 'MEO' | 'MDRRMO' {
  if (value !== 'MEO' && value !== 'MDRRMO') {
    throw new BadRequestException('toOffice must be MEO or MDRRMO');
  }
  return value;
}

// An external agency: required, trimmed, at most REFERRAL_AGENCY_MAX_LENGTH
// characters, and never MEO or MDRRMO themselves — moving a ticket between
// the two offices is a Reassign.
export function validateReferralAgency(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestException('Agency is required');
  }
  const agency = value.trim();
  if (agency.length > REFERRAL_AGENCY_MAX_LENGTH) {
    throw new BadRequestException(
      `Agency must be at most ${REFERRAL_AGENCY_MAX_LENGTH} characters`,
    );
  }
  if (['meo', 'mdrrmo'].includes(agency.toLowerCase())) {
    throw new BadRequestException(
      `${agency} is a municipal office, not an external agency. Use Reassign to move the ticket between MEO and MDRRMO.`,
    );
  }
  return agency;
}
