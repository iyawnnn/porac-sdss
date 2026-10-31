import { BadRequestException } from '@nestjs/common';
import {
  reassignDestinationBlock,
  referDestinationBlock,
  routingBlock,
  validateReassignOffice,
  validateReferralAgency,
  validateRoutingReason,
  type RoutingActor,
  type RoutingTicketFacts,
} from './ticket-routing.rules';

// Manuscript revision Phase 5, step 5a: the one rule behind Reassign and
// Refer, for the endpoints and the buttons alike.

const FOCAL: RoutingActor = {
  accountType: 'PERSONNEL',
  isFocal: true,
  office: 'MDRRMO',
};
const MEO: RoutingActor = {
  accountType: 'PERSONNEL',
  isFocal: false,
  office: 'MEO',
};
const MDRRMO: RoutingActor = {
  accountType: 'PERSONNEL',
  isFocal: false,
  office: 'MDRRMO',
};
const MIS: RoutingActor = {
  accountType: 'SYSTEM_ADMIN',
  isFocal: false,
  office: null,
};

function ticket(
  overrides: Partial<RoutingTicketFacts> = {},
): RoutingTicketFacts {
  return {
    id: 7,
    status: 'Reported',
    assignedOffice: 'MEO',
    mergedIntoTicketId: null,
    activeWorkOrders: 0,
    ...overrides,
  };
}

describe('routingBlock — Focal Personnel', () => {
  it('may route a Reported ticket of either office with no active Work Order', () => {
    expect(routingBlock(FOCAL, ticket())).toBeNull();
    expect(
      routingBlock(FOCAL, ticket({ assignedOffice: 'MDRRMO' })),
    ).toBeNull();
  });

  it.each(['Under Review', 'In Progress', 'Resolved', 'Rejected'])(
    'may not route a %s ticket (403); the responsible office handles it',
    (status) => {
      expect(routingBlock(FOCAL, ticket({ status }))).toEqual({
        status: 403,
        message: `Focal Personnel can only reassign or refer a ticket while it is still Reported; Ticket #7 is ${status}. The responsible office handles routing from here.`,
      });
    },
  );

  it('may not route a Reported ticket with an active Work Order (403)', () => {
    expect(routingBlock(FOCAL, ticket({ activeWorkOrders: 1 }))).toEqual({
      status: 403,
      message:
        'Focal Personnel can only reassign or refer a ticket before work starts; Ticket #7 has an active Work Order. The responsible office handles routing from here.',
    });
  });

  it('may not route a merged-away Reported ticket (409)', () => {
    expect(routingBlock(FOCAL, ticket({ mergedIntoTicketId: 3 }))?.status).toBe(
      409,
    );
  });
});

describe('routingBlock — the responsible office', () => {
  it.each(['Reported', 'Under Review', 'In Progress', 'Resolved'])(
    'may route its own %s ticket with no active Work Order',
    (status) => {
      expect(routingBlock(MEO, ticket({ status }))).toBeNull();
      expect(
        routingBlock(MDRRMO, ticket({ status, assignedOffice: 'MDRRMO' })),
      ).toBeNull();
    },
  );

  it("may not route the other office's ticket (403)", () => {
    expect(routingBlock(MDRRMO, ticket())).toEqual({
      status: 403,
      message: "You do not have access to this office's data.",
    });
  });

  it('may not route a Rejected ticket (409)', () => {
    expect(routingBlock(MEO, ticket({ status: 'Rejected' }))).toEqual({
      status: 409,
      message:
        'Ticket #7 is Rejected and can no longer be reassigned or referred.',
    });
  });

  it('may not route a merged-away ticket (409), whatever its status', () => {
    expect(
      routingBlock(
        MEO,
        ticket({ status: 'Under Review', mergedIntoTicketId: 3 }),
      ),
    ).toEqual({
      status: 409,
      message: 'Ticket #7 was merged into Ticket #3 and is read-only.',
    });
  });

  it('may not route while a Work Order is pending or in progress (409)', () => {
    expect(
      routingBlock(MEO, ticket({ status: 'In Progress', activeWorkOrders: 2 })),
    ).toEqual({
      status: 409,
      message:
        'Ticket #7 has an active Work Order. Finish or cancel its Work Orders before reassigning or referring it.',
    });
  });
});

describe('routingBlock — the System Administrator', () => {
  it('never routes (403)', () => {
    expect(routingBlock(MIS, ticket())).toEqual({
      status: 403,
      message:
        'Only MEO, MDRRMO and Focal Personnel can reassign or refer a ticket.',
    });
  });
});

describe('destinations', () => {
  it('a Reassign to the current office is a no-op (400); to the other office is fine', () => {
    expect(reassignDestinationBlock(ticket(), 'MEO')).toEqual({
      status: 400,
      message: 'Ticket #7 is already assigned to MEO.',
    });
    expect(reassignDestinationBlock(ticket(), 'MDRRMO')).toBeNull();
  });

  it("a Refer to the latest referral's agency is a no-op (400), ignoring case and spaces", () => {
    expect(
      referDestinationBlock(ticket(), ' dpwh ', {
        actionType: 'REFER',
        referralTarget: 'DPWH',
      }),
    ).toEqual({
      status: 400,
      message: 'Ticket #7 is already referred to DPWH.',
    });
  });

  it('a Refer is fine with no earlier routing, another agency, or a Reassign since', () => {
    expect(referDestinationBlock(ticket(), 'DPWH', null)).toBeNull();
    expect(
      referDestinationBlock(ticket(), 'MENRO', {
        actionType: 'REFER',
        referralTarget: 'DPWH',
      }),
    ).toBeNull();
    expect(
      referDestinationBlock(ticket(), 'DPWH', {
        actionType: 'REASSIGN',
        referralTarget: null,
      }),
    ).toBeNull();
  });

  it('validateReassignOffice accepts only MEO and MDRRMO', () => {
    expect(validateReassignOffice('MEO')).toBe('MEO');
    expect(validateReassignOffice('MDRRMO')).toBe('MDRRMO');
    for (const bad of ['meo', 'DPWH', undefined, 1]) {
      expect(() => validateReassignOffice(bad)).toThrow(
        new BadRequestException('toOffice must be MEO or MDRRMO'),
      );
    }
  });

  it('validateReferralAgency trims, caps at 200 and refuses the two offices', () => {
    expect(validateReferralAgency('  MENRO  ')).toBe('MENRO');
    expect(validateReferralAgency('x'.repeat(200))).toHaveLength(200);
    expect(() => validateReferralAgency('x'.repeat(201))).toThrow(
      'Agency must be at most 200 characters',
    );
    for (const bad of ['', '  ', undefined, null, 5]) {
      expect(() => validateReferralAgency(bad)).toThrow('Agency is required');
    }
    for (const office of ['MEO', 'mdrrmo', ' Mdrrmo ']) {
      expect(() => validateReferralAgency(office)).toThrow(
        /is a municipal office, not an external agency\. Use Reassign/,
      );
    }
  });
});

describe('validateRoutingReason', () => {
  it('returns the trimmed reason', () => {
    expect(validateRoutingReason('  Belongs to MDRRMO \n')).toBe(
      'Belongs to MDRRMO',
    );
  });

  it.each([
    ['missing', undefined],
    ['null', null],
    ['empty', ''],
    ['blank after trimming', ' \t\n '],
    ['not text', 12],
  ])('refuses a reason that is %s', (_label, reason) => {
    expect(() => validateRoutingReason(reason)).toThrow(
      new BadRequestException('A reason is required.'),
    );
  });

  it('accepts 1000 characters and refuses 1001', () => {
    expect(validateRoutingReason('x'.repeat(1000))).toHaveLength(1000);
    expect(() => validateRoutingReason('x'.repeat(1001))).toThrow(
      'The reason must be 1000 characters or fewer.',
    );
  });
});
