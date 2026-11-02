import { BadRequestException } from '@nestjs/common';
import {
  RESOLUTION_OUTCOMES,
  TICKET_RESOLUTION_NOTES_MAX_LENGTH,
  TICKET_RETURN_REASON_MAX_LENGTH,
  type ResolutionOutcome,
} from '../contracts/schemas';
import type { GroupingBlock } from './ticket-grouping.rules';

// The rules for resolving a ticket and for returning a Resolved ticket to
// Under Review (manuscript revision Phase 5, step 5c; migration 0046). Pure,
// so TicketsService (which checks them again on the locked row) and Ticket
// Detail's "Return to Under Review" availability use the very same rules and
// messages.
//
// Who may act is not here: resolving and returning are status changes, so
// they keep advanceStatus's existing gate — operational Personnel of the
// ticket's current office only (OperationalStaffGuard + assertOfficeAccess),
// never Focal or the System Administrator, never a merged-away ticket.

export type ResolutionBlock = GroupingBlock;

export const RESOLUTION_OUTCOME_LABEL: Record<ResolutionOutcome, string> = {
  MUNICIPAL_ACTION_COMPLETED: 'Municipal action completed',
  EXTERNAL_REFERRAL: 'External referral',
};

// Resolving requires an outcome and non-blank notes (trimmed, at most
// TICKET_RESOLUTION_NOTES_MAX_LENGTH). The photo stays optional.
export function validateResolutionInput(
  outcome: unknown,
  notes: unknown,
): { outcome: ResolutionOutcome; notes: string } {
  if (
    typeof outcome !== 'string' ||
    !(RESOLUTION_OUTCOMES as readonly string[]).includes(outcome)
  ) {
    throw new BadRequestException(
      'An outcome is required to resolve a ticket: MUNICIPAL_ACTION_COMPLETED or EXTERNAL_REFERRAL.',
    );
  }
  if (typeof notes !== 'string' || notes.trim().length === 0) {
    throw new BadRequestException(
      'Resolution notes are required to resolve a ticket.',
    );
  }
  const trimmed = notes.trim();
  if (trimmed.length > TICKET_RESOLUTION_NOTES_MAX_LENGTH) {
    throw new BadRequestException(
      `Resolution notes must be ${TICKET_RESOLUTION_NOTES_MAX_LENGTH} characters or fewer.`,
    );
  }
  return { outcome: outcome as ResolutionOutcome, notes: trimmed };
}

export interface ResolveFacts {
  id: number;
  // Work Orders still pending or in progress.
  activeWorkOrders: number;
  // REFER rows in routing_actions for this ticket.
  referralCount: number;
}

// Resolving is refused while a Work Order is pending or in progress
// (Completed and Cancelled are final and never block), and an External
// Referral outcome needs at least one recorded referral.
export function resolveBlock(
  facts: ResolveFacts,
  outcome: ResolutionOutcome,
): ResolutionBlock | null {
  if (facts.activeWorkOrders > 0) {
    return {
      status: 409,
      message: `Ticket #${facts.id} has ${facts.activeWorkOrders} active Work Order${facts.activeWorkOrders === 1 ? '' : 's'}. Complete or cancel ${facts.activeWorkOrders === 1 ? 'it' : 'them'} before resolving the ticket.`,
    };
  }
  if (outcome === 'EXTERNAL_REFERRAL' && facts.referralCount === 0) {
    return {
      status: 409,
      message: `Ticket #${facts.id} has no recorded referral. Refer it to an external agency first, or resolve it as Municipal action completed.`,
    };
  }
  return null;
}

// Required, trimmed, 1 to TICKET_RETURN_REASON_MAX_LENGTH characters.
export function validateReturnReason(reason: unknown): string {
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    throw new BadRequestException(
      'A reason is required to return a ticket to Under Review.',
    );
  }
  const trimmed = reason.trim();
  if (trimmed.length > TICKET_RETURN_REASON_MAX_LENGTH) {
    throw new BadRequestException(
      `The reason must be ${TICKET_RETURN_REASON_MAX_LENGTH} characters or fewer.`,
    );
  }
  return trimmed;
}

export interface ReturnFacts {
  id: number;
  status: string;
  resolutionOutcome: ResolutionOutcome | null;
  // NULL on a legacy Resolved ticket (resolved before migration 0046).
  resolvedAt: string | null;
  mergedIntoTicketId: number | null;
}

// A ticket may return to Under Review only when it is Resolved with the
// External Referral outcome recorded by this step (resolved_at set), so a
// legacy Resolved ticket — whatever outcome 0036 gave it — never can.
export function returnBlock(facts: ReturnFacts): ResolutionBlock | null {
  if (facts.mergedIntoTicketId !== null) {
    return {
      status: 409,
      message: `Ticket #${facts.id} was merged into Ticket #${facts.mergedIntoTicketId} and is read-only.`,
    };
  }
  if (facts.status !== 'Resolved') {
    return {
      status: 409,
      message: `Ticket #${facts.id} is ${facts.status}; only a Resolved ticket can be returned to Under Review.`,
    };
  }
  if (facts.resolvedAt === null) {
    return {
      status: 409,
      message: `Ticket #${facts.id} was resolved before outcomes were recorded (legacy) and can't be returned to Under Review.`,
    };
  }
  if (facts.resolutionOutcome !== 'EXTERNAL_REFERRAL') {
    const label = facts.resolutionOutcome
      ? RESOLUTION_OUTCOME_LABEL[facts.resolutionOutcome]
      : 'no outcome';
    return {
      status: 409,
      message: `Ticket #${facts.id} was resolved as ${label}; only a ticket resolved by External referral can be returned to Under Review.`,
    };
  }
  return null;
}

// A Resolved ticket with no resolved_at was resolved before this step. Its
// stored outcome (0036 gave every one MUNICIPAL_ACTION_COMPLETED) is never
// shown: the UI and the export say "Not recorded (legacy)" / blank.
export function isLegacyResolution(
  status: string,
  resolvedAt: string | null,
): boolean {
  return status === 'Resolved' && resolvedAt === null;
}
