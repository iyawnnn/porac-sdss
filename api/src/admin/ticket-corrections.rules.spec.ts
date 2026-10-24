import { BadRequestException } from '@nestjs/common';
import {
  type CorrectionActor,
  type CorrectionTicketFacts,
  categoryCorrectionBlock,
  correctionBlock,
  officeChangeBlock,
  validateCorrectionCategory,
  validateCorrectionPoint,
} from './ticket-corrections.rules';

// Manuscript revision Phase 3, step 3e: who may correct a ticket's category
// or location, and when, each with its message.

const MEO: CorrectionActor = {
  accountType: 'PERSONNEL',
  isFocal: false,
  office: 'MEO',
};
const MDRRMO: CorrectionActor = {
  accountType: 'PERSONNEL',
  isFocal: false,
  office: 'MDRRMO',
};
const FOCAL: CorrectionActor = {
  accountType: 'PERSONNEL',
  isFocal: true,
  office: 'MDRRMO',
};
const SYSTEM_ADMIN: CorrectionActor = {
  accountType: 'SYSTEM_ADMIN',
  isFocal: false,
  office: null,
};

function ticket(
  overrides: Partial<CorrectionTicketFacts> = {},
): CorrectionTicketFacts {
  return {
    id: 7,
    status: 'Reported',
    assignedOffice: 'MEO',
    category: 'Pothole / Road Surface Damage',
    mergedIntoTicketId: null,
    activeWorkOrders: 0,
    ...overrides,
  };
}

describe('correctionBlock (who may correct, and when)', () => {
  it("lets operational Personnel correct their own office's active tickets, in any active status", () => {
    for (const status of ['Reported', 'Under Review', 'In Progress']) {
      expect(correctionBlock(MEO, ticket({ status }))).toBeNull();
    }
    expect(
      correctionBlock(MDRRMO, ticket({ assignedOffice: 'MDRRMO' })),
    ).toBeNull();
  });

  it("refuses another office's ticket (403)", () => {
    expect(correctionBlock(MDRRMO, ticket())).toEqual({
      status: 403,
      message: "You do not have access to this office's data.",
    });
  });

  it('lets Focal correct a Reported ticket of either office with no active Work Order', () => {
    expect(correctionBlock(FOCAL, ticket())).toBeNull();
    expect(
      correctionBlock(FOCAL, ticket({ assignedOffice: 'MDRRMO' })),
    ).toBeNull();
  });

  it('stops Focal past Reported (403)', () => {
    expect(correctionBlock(FOCAL, ticket({ status: 'Under Review' }))).toEqual({
      status: 403,
      message:
        'Focal Personnel can only correct a ticket while it is still Reported; Ticket #7 is Under Review.',
    });
  });

  it('stops Focal once a Work Order is active (403)', () => {
    expect(correctionBlock(FOCAL, ticket({ activeWorkOrders: 1 }))).toEqual({
      status: 403,
      message:
        'Focal Personnel can only correct a ticket before work starts; Ticket #7 has an active Work Order.',
    });
  });

  it('never lets the System Administrator (403)', () => {
    expect(correctionBlock(SYSTEM_ADMIN, ticket())).toEqual({
      status: 403,
      message: 'Only MEO, MDRRMO and Focal Personnel can correct a ticket.',
    });
  });

  it('refuses a merged-away ticket (409)', () => {
    expect(correctionBlock(MEO, ticket({ mergedIntoTicketId: 3 }))).toEqual({
      status: 409,
      message: 'Ticket #7 was merged into Ticket #3 and is read-only.',
    });
  });

  it.each(['Resolved', 'Rejected'])('refuses a %s ticket (409)', (status) => {
    expect(correctionBlock(MEO, ticket({ status }))).toEqual({
      status: 409,
      message: `Ticket #7 is ${status}; only active tickets can be corrected.`,
    });
  });
});

describe('categoryCorrectionBlock', () => {
  it('allows a different category of the same office, even with an active Work Order', () => {
    expect(
      categoryCorrectionBlock(
        MEO,
        ticket({ activeWorkOrders: 2 }),
        'Uneven Sidewalk',
      ),
    ).toBeNull();
  });

  it('allows a category of the other office when no Work Order is active', () => {
    expect(
      categoryCorrectionBlock(MEO, ticket(), 'Localized Flooding'),
    ).toBeNull();
  });

  it('blocks a category of the other office while a Work Order is pending or in progress (409)', () => {
    expect(
      categoryCorrectionBlock(
        MEO,
        ticket({ activeWorkOrders: 1 }),
        'Localized Flooding',
      ),
    ).toEqual({
      status: 409,
      message:
        'Ticket #7 has an active Work Order, and the new category belongs to the other office. Finish or cancel the Work Orders first.',
    });
  });

  it('refuses the category the ticket already has (400)', () => {
    expect(
      categoryCorrectionBlock(MEO, ticket(), 'Pothole / Road Surface Damage'),
    ).toEqual({
      status: 400,
      message:
        'Ticket #7 already has the category Pothole / Road Surface Damage.',
    });
  });

  it('checks who may correct first', () => {
    expect(
      categoryCorrectionBlock(SYSTEM_ADMIN, ticket(), 'Uneven Sidewalk')
        ?.status,
    ).toBe(403);
    expect(
      categoryCorrectionBlock(
        MEO,
        ticket({ status: 'Resolved' }),
        'Uneven Sidewalk',
      )?.status,
    ).toBe(409);
  });
});

describe('officeChangeBlock', () => {
  it('is null with no active Work Order (completed and cancelled ones are not counted)', () => {
    expect(officeChangeBlock(ticket({ activeWorkOrders: 0 }))).toBeNull();
  });

  it('carries the "Finish or cancel the Work Orders first" message otherwise', () => {
    expect(officeChangeBlock(ticket({ activeWorkOrders: 1 }))?.message).toMatch(
      /Finish or cancel the Work Orders first\.$/,
    );
  });
});

describe('validateCorrectionCategory', () => {
  it('accepts a current category', () => {
    expect(validateCorrectionCategory('Localized Flooding')).toBe(
      'Localized Flooding',
    );
  });

  it.each([
    'Flooding',
    'Drainage / Culvert / Manhole Issue',
    'Soil Erosion',
    '',
    42,
    undefined,
  ])('rejects %p, which is not a current category (400)', (value) => {
    expect(() => validateCorrectionCategory(value)).toThrow(
      new BadRequestException('Choose one of the current categories.'),
    );
  });
});

describe('validateCorrectionPoint', () => {
  it('accepts numbers and numeric strings', () => {
    expect(validateCorrectionPoint(15.07, 120.52)).toEqual({
      lat: 15.07,
      lng: 120.52,
    });
    expect(validateCorrectionPoint('15.07', '120.52')).toEqual({
      lat: 15.07,
      lng: 120.52,
    });
  });

  it.each([
    ['abc', 120],
    [15, undefined],
    [91, 120],
    [15, 181],
    [Number.NaN, 120],
  ])('rejects (%p, %p) (400)', (lat, lng) => {
    expect(() => validateCorrectionPoint(lat, lng)).toThrow(
      new BadRequestException('Choose a point on the map.'),
    );
  });
});
