import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  type GroupingActor,
  type GroupingTicketFacts,
  GROUPING_REASON_MAX_LENGTH,
  assertNotMergedAway,
  mergeBlock,
  regroupBlock,
  removeBlock,
  toHttpException,
  validateGroupingReason,
  validateTicketId,
} from './ticket-grouping.rules';

// Manuscript revision Phase 3, step 3d: the Merge / Remove / Regroup
// preconditions, each with its message.

const MEO: GroupingActor = {
  accountType: 'PERSONNEL',
  isFocal: false,
  office: 'MEO',
};
const MDRRMO: GroupingActor = {
  accountType: 'PERSONNEL',
  isFocal: false,
  office: 'MDRRMO',
};
const FOCAL: GroupingActor = {
  accountType: 'PERSONNEL',
  isFocal: true,
  office: 'MDRRMO',
};
const SYSTEM_ADMIN: GroupingActor = {
  accountType: 'SYSTEM_ADMIN',
  isFocal: false,
  office: null,
};

function ticket(
  id: number,
  overrides: Partial<GroupingTicketFacts> = {},
): GroupingTicketFacts {
  return {
    id,
    status: 'Reported',
    assignedOffice: 'MEO',
    category: 'Pothole / Road Surface Damage',
    mergedIntoTicketId: null,
    activeWorkOrders: 0,
    ...overrides,
  };
}

describe('mergeBlock', () => {
  it('allows two active, same-category, same-office tickets', () => {
    expect(mergeBlock(MEO, ticket(1), ticket(2))).toBeNull();
  });

  it('rejects merging a ticket into itself (400)', () => {
    expect(mergeBlock(MEO, ticket(1), ticket(1))).toEqual({
      status: 400,
      message: 'Choose two different tickets to merge.',
    });
  });

  it('asks for a Reassign or Refer when the offices differ (409)', () => {
    expect(
      mergeBlock(MEO, ticket(1), ticket(2, { assignedOffice: 'MDRRMO' })),
    ).toEqual({
      status: 409,
      message:
        'Ticket #1 and Ticket #2 are assigned to different offices. Reassign or Refer first so both tickets have the same office.',
    });
  });

  it('asks for a category correction when the categories differ (409)', () => {
    expect(
      mergeBlock(MEO, ticket(1), ticket(2, { category: 'Streetlight Out' })),
    ).toEqual({
      status: 409,
      message:
        'Ticket #1 and Ticket #2 have different categories. Correct the category first.',
    });
  });

  it('blocks merging away a ticket with an active Work Order (409)', () => {
    expect(
      mergeBlock(MEO, ticket(1), ticket(2, { activeWorkOrders: 1 })),
    ).toEqual({
      status: 409,
      message:
        'Ticket #2 has an active Work Order. Finish or cancel its Work Orders first.',
    });
  });

  it('lets the survivor keep its active Work Orders', () => {
    expect(
      mergeBlock(MEO, ticket(1, { activeWorkOrders: 2 }), ticket(2)),
    ).toBeNull();
  });

  it.each(['Resolved', 'Rejected'])('refuses a %s ticket (409)', (status) => {
    expect(mergeBlock(MEO, ticket(1), ticket(2, { status }))).toEqual({
      status: 409,
      message: `Ticket #2 is ${status}; only active tickets can be merged or have reports moved.`,
    });
  });

  it('refuses a ticket already merged away, on either side (409)', () => {
    expect(
      mergeBlock(MEO, ticket(1, { mergedIntoTicketId: 9 }), ticket(2)),
    ).toEqual({
      status: 409,
      message: 'Ticket #1 was already merged into Ticket #9.',
    });
    expect(
      mergeBlock(MEO, ticket(1), ticket(2, { mergedIntoTicketId: 9 })),
    ).toEqual({
      status: 409,
      message: 'Ticket #2 was already merged into Ticket #9.',
    });
  });
});

describe('who may merge, remove or regroup', () => {
  it("lets operational Personnel act on their own office's tickets only (403 otherwise)", () => {
    expect(mergeBlock(MEO, ticket(1), ticket(2))).toBeNull();
    const mdrrmoPair = [
      ticket(1, { assignedOffice: 'MDRRMO' }),
      ticket(2, { assignedOffice: 'MDRRMO' }),
    ] as const;
    expect(mergeBlock(MDRRMO, ...mdrrmoPair)).toBeNull();
    expect(mergeBlock(MEO, ...mdrrmoPair)).toEqual({
      status: 403,
      message: "You do not have access to this office's data.",
    });
  });

  it('lets Focal act on any office while every ticket is Reported with no active Work Order', () => {
    expect(mergeBlock(FOCAL, ticket(1), ticket(2))).toBeNull();
    expect(
      mergeBlock(
        FOCAL,
        ticket(1, { assignedOffice: 'MDRRMO' }),
        ticket(2, { assignedOffice: 'MDRRMO' }),
      ),
    ).toBeNull();
  });

  it('stops Focal once a ticket is past Reported (403)', () => {
    expect(
      mergeBlock(FOCAL, ticket(1, { status: 'Under Review' }), ticket(2)),
    ).toEqual({
      status: 403,
      message:
        'Focal Personnel can only merge tickets or move reports while they are still Reported; Ticket #1 is Under Review.',
    });
  });

  it("stops Focal when any ticket involved has an active Work Order, the survivor's too (403)", () => {
    expect(
      mergeBlock(FOCAL, ticket(1, { activeWorkOrders: 1 }), ticket(2)),
    ).toEqual({
      status: 403,
      message:
        'Focal Personnel can only merge tickets or move reports before work starts; Ticket #1 has an active Work Order.',
    });
    expect(
      regroupBlock(FOCAL, ticket(1, { activeWorkOrders: 1 }), ticket(2), 2),
    ).toEqual({
      status: 403,
      message:
        'Focal Personnel can only merge tickets or move reports before work starts; Ticket #1 has an active Work Order.',
    });
  });

  it('never lets the System Administrator (403)', () => {
    const expected = {
      status: 403,
      message:
        'Only MEO, MDRRMO and Focal Personnel can merge tickets or move reports.',
    };
    expect(mergeBlock(SYSTEM_ADMIN, ticket(1), ticket(2))).toEqual(expected);
    expect(regroupBlock(SYSTEM_ADMIN, ticket(1), ticket(2), 2)).toEqual(
      expected,
    );
    expect(removeBlock(SYSTEM_ADMIN, ticket(1), 2)).toEqual(expected);
  });
});

describe('regroupBlock', () => {
  it('allows moving a report between active same-category, same-office tickets', () => {
    expect(regroupBlock(MEO, ticket(1), ticket(2), 2)).toBeNull();
  });

  it("is not blocked by the source ticket's Work Orders (only merging away is)", () => {
    expect(
      regroupBlock(MEO, ticket(1, { activeWorkOrders: 1 }), ticket(2), 2),
    ).toBeNull();
  });

  it('keeps at least one report on the source ticket (409)', () => {
    expect(regroupBlock(MEO, ticket(1), ticket(2), 1)).toEqual({
      status: 409,
      message:
        'Ticket #1 would have no reports left. Merge the tickets instead.',
    });
  });

  it('applies the Merge rules between the two tickets', () => {
    expect(regroupBlock(MEO, ticket(1), ticket(1), 2)?.status).toBe(400);
    expect(
      regroupBlock(MEO, ticket(1), ticket(2, { assignedOffice: 'MDRRMO' }), 2)
        ?.message,
    ).toMatch(/Reassign or Refer first/);
    expect(
      regroupBlock(
        MEO,
        ticket(1),
        ticket(2, { category: 'Streetlight Out' }),
        2,
      )?.message,
    ).toMatch(/Correct the category first/);
    expect(
      regroupBlock(MEO, ticket(1), ticket(2, { status: 'Resolved' }), 2)
        ?.status,
    ).toBe(409);
    expect(
      regroupBlock(MEO, ticket(1), ticket(2, { mergedIntoTicketId: 4 }), 2)
        ?.message,
    ).toBe('Ticket #2 was already merged into Ticket #4.');
  });
});

describe('removeBlock', () => {
  it('allows taking a report out of an active ticket with two or more', () => {
    expect(removeBlock(MEO, ticket(1), 2)).toBeNull();
  });

  it('needs at least two reports (409)', () => {
    expect(removeBlock(MEO, ticket(1), 1)).toEqual({
      status: 409,
      message:
        'Ticket #1 has only this report, so there is nothing to remove it from.',
    });
  });

  it('needs an active ticket that is not merged away (409)', () => {
    expect(removeBlock(MEO, ticket(1, { status: 'Rejected' }), 2)?.status).toBe(
      409,
    );
    expect(
      removeBlock(MEO, ticket(1, { mergedIntoTicketId: 3 }), 2)?.status,
    ).toBe(409);
  });

  it("checks the actor's access to the ticket (403)", () => {
    expect(removeBlock(MDRRMO, ticket(1), 2)?.status).toBe(403);
    expect(
      removeBlock(FOCAL, ticket(1, { status: 'In Progress' }), 2)?.status,
    ).toBe(403);
  });
});

describe('validateGroupingReason', () => {
  it('trims and returns a reason of 1 to 1000 characters', () => {
    expect(validateGroupingReason('  same pothole  ')).toBe('same pothole');
    expect(
      validateGroupingReason('x'.repeat(GROUPING_REASON_MAX_LENGTH)),
    ).toHaveLength(1000);
  });

  it.each([undefined, null, '', '   ', 42])('rejects %p (400)', (reason) => {
    expect(() => validateGroupingReason(reason)).toThrow(
      new BadRequestException('A reason is required.'),
    );
  });

  it('rejects a reason over 1000 characters (400)', () => {
    expect(() => validateGroupingReason('x'.repeat(1001))).toThrow(
      new BadRequestException('The reason must be 1000 characters or fewer.'),
    );
  });
});

describe('validateTicketId', () => {
  it.each([0, -1, 1.5, 'abc', undefined])('rejects %p (400)', (value) => {
    expect(() => validateTicketId(value, 'survivorTicketId')).toThrow(
      new BadRequestException('survivorTicketId must be a positive integer.'),
    );
  });

  it('accepts a positive integer, also as a string', () => {
    expect(validateTicketId('12', 'x')).toBe(12);
  });
});

describe('toHttpException', () => {
  it('maps each status to its exception', () => {
    expect(toHttpException({ status: 400, message: 'a' })).toBeInstanceOf(
      BadRequestException,
    );
    expect(toHttpException({ status: 403, message: 'b' })).toBeInstanceOf(
      ForbiddenException,
    );
    expect(toHttpException({ status: 409, message: 'c' })).toBeInstanceOf(
      ConflictException,
    );
  });
});

describe('assertNotMergedAway', () => {
  it('lets an unmerged ticket through', () => {
    expect(() =>
      assertNotMergedAway({ id: 5, merged_into_ticket_id: null }),
    ).not.toThrow();
    expect(() => assertNotMergedAway({ id: 5 })).not.toThrow();
  });

  it('makes a merged-away ticket read-only (409)', () => {
    expect(() =>
      assertNotMergedAway({ id: 5, merged_into_ticket_id: 3 }),
    ).toThrow(
      new ConflictException(
        'Ticket #5 was merged into Ticket #3 and is read-only.',
      ),
    );
  });
});
