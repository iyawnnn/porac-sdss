import { BadRequestException } from '@nestjs/common';
import {
  isLegacyResolution,
  resolveBlock,
  returnBlock,
  validateResolutionInput,
  validateReturnReason,
  type ReturnFacts,
} from './ticket-resolution.rules';

// Manuscript revision Phase 5, step 5c: the pure resolve / return rules.

describe('validateResolutionInput', () => {
  it.each([undefined, null, '', 'RESOLVED', 'municipal_action_completed', 1])(
    'refuses a missing or unknown outcome (%p)',
    (outcome) => {
      expect(() => validateResolutionInput(outcome, 'Patched.')).toThrow(
        new BadRequestException(
          'An outcome is required to resolve a ticket: MUNICIPAL_ACTION_COMPLETED or EXTERNAL_REFERRAL.',
        ),
      );
    },
  );

  it.each([undefined, null, '', '   ', 42])(
    'refuses missing or blank notes (%p)',
    (notes) => {
      expect(() =>
        validateResolutionInput('MUNICIPAL_ACTION_COMPLETED', notes),
      ).toThrow(
        new BadRequestException(
          'Resolution notes are required to resolve a ticket.',
        ),
      );
    },
  );

  it('refuses notes over 2000 characters, accepts exactly 2000', () => {
    expect(() =>
      validateResolutionInput('EXTERNAL_REFERRAL', 'x'.repeat(2001)),
    ).toThrow('Resolution notes must be 2000 characters or fewer.');
    expect(
      validateResolutionInput('EXTERNAL_REFERRAL', 'x'.repeat(2000)).notes,
    ).toHaveLength(2000);
  });

  it('trims the notes and returns both values', () => {
    expect(
      validateResolutionInput('EXTERNAL_REFERRAL', '  Referred to DPWH.  '),
    ).toEqual({ outcome: 'EXTERNAL_REFERRAL', notes: 'Referred to DPWH.' });
  });
});

describe('resolveBlock', () => {
  it('refuses while a Work Order is pending or in progress, naming the count', () => {
    expect(
      resolveBlock(
        { id: 7, activeWorkOrders: 1, referralCount: 1 },
        'MUNICIPAL_ACTION_COMPLETED',
      ),
    ).toEqual({
      status: 409,
      message:
        'Ticket #7 has 1 active Work Order. Complete or cancel it before resolving the ticket.',
    });
    expect(
      resolveBlock(
        { id: 7, activeWorkOrders: 2, referralCount: 0 },
        'EXTERNAL_REFERRAL',
      )?.message,
    ).toBe(
      'Ticket #7 has 2 active Work Orders. Complete or cancel them before resolving the ticket.',
    );
  });

  it('refuses External Referral with no recorded referral', () => {
    expect(
      resolveBlock(
        { id: 7, activeWorkOrders: 0, referralCount: 0 },
        'EXTERNAL_REFERRAL',
      ),
    ).toEqual({
      status: 409,
      message:
        'Ticket #7 has no recorded referral. Refer it to an external agency first, or resolve it as Municipal action completed.',
    });
  });

  it('allows Municipal action completed with no referral, and External Referral with one', () => {
    expect(
      resolveBlock(
        { id: 7, activeWorkOrders: 0, referralCount: 0 },
        'MUNICIPAL_ACTION_COMPLETED',
      ),
    ).toBeNull();
    expect(
      resolveBlock(
        { id: 7, activeWorkOrders: 0, referralCount: 1 },
        'EXTERNAL_REFERRAL',
      ),
    ).toBeNull();
  });
});

describe('validateReturnReason', () => {
  it.each([undefined, null, '', '  ', 3])('refuses %p', (reason) => {
    expect(() => validateReturnReason(reason)).toThrow(
      new BadRequestException(
        'A reason is required to return a ticket to Under Review.',
      ),
    );
  });

  it('refuses over 1000 characters and trims', () => {
    expect(() => validateReturnReason('x'.repeat(1001))).toThrow(
      'The reason must be 1000 characters or fewer.',
    );
    expect(validateReturnReason('  DPWH declined.  ')).toBe('DPWH declined.');
  });
});

describe('returnBlock', () => {
  const resolvedByReferral: ReturnFacts = {
    id: 9,
    status: 'Resolved',
    resolutionOutcome: 'EXTERNAL_REFERRAL',
    resolvedAt: '2026-11-01T08:00:00.000Z',
    mergedIntoTicketId: null,
  };

  it('allows a Resolved External Referral ticket resolved since 0046', () => {
    expect(returnBlock(resolvedByReferral)).toBeNull();
  });

  it.each(['Reported', 'Under Review', 'In Progress', 'Rejected'])(
    'refuses a %s ticket, naming the status',
    (status) => {
      expect(
        returnBlock({
          ...resolvedByReferral,
          status,
          resolutionOutcome: null,
          resolvedAt: null,
        }),
      ).toEqual({
        status: 409,
        message: `Ticket #9 is ${status}; only a Resolved ticket can be returned to Under Review.`,
      });
    },
  );

  it('refuses a legacy Resolved ticket whatever outcome 0036 stored', () => {
    for (const outcome of [
      'MUNICIPAL_ACTION_COMPLETED',
      'EXTERNAL_REFERRAL',
      null,
    ] as const) {
      expect(
        returnBlock({
          ...resolvedByReferral,
          resolutionOutcome: outcome,
          resolvedAt: null,
        })?.message,
      ).toBe(
        "Ticket #9 was resolved before outcomes were recorded (legacy) and can't be returned to Under Review.",
      );
    }
  });

  it('refuses a ticket resolved as Municipal action completed, naming the outcome', () => {
    expect(
      returnBlock({
        ...resolvedByReferral,
        resolutionOutcome: 'MUNICIPAL_ACTION_COMPLETED',
      }),
    ).toEqual({
      status: 409,
      message:
        'Ticket #9 was resolved as Municipal action completed; only a ticket resolved by External referral can be returned to Under Review.',
    });
  });

  it('refuses a merged-away ticket first', () => {
    expect(
      returnBlock({ ...resolvedByReferral, mergedIntoTicketId: 3 })?.message,
    ).toBe('Ticket #9 was merged into Ticket #3 and is read-only.');
  });
});

describe('isLegacyResolution', () => {
  it('is true only for a Resolved ticket with no resolved_at', () => {
    expect(isLegacyResolution('Resolved', null)).toBe(true);
    expect(isLegacyResolution('Resolved', '2026-11-01T08:00:00.000Z')).toBe(
      false,
    );
    expect(isLegacyResolution('Under Review', null)).toBe(false);
  });
});
