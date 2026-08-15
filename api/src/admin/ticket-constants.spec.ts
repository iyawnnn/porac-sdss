import { TICKET_STATUSES, NEXT_STATUS } from './ticket-constants';

// Phase 6 manuscript-alignment regression guard: nothing previously pinned
// the ticket_status enum to exactly these 5 values, so a silent 6th status
// (or a stray "Validated"/"Duplicate" — neither of which is a real ticket
// status; "Duplicate" is report-moderation/grouping logic only) would not
// have failed any existing test.
describe('TICKET_STATUSES (manuscript lifecycle)', () => {
  it('is exactly the 5 manuscript-defined statuses, in order', () => {
    expect(TICKET_STATUSES).toEqual([
      'Reported',
      'Under Review',
      'In Progress',
      'Resolved',
      'Rejected',
    ]);
  });

  it('never includes Validated or Duplicate', () => {
    expect(TICKET_STATUSES).not.toContain('Validated');
    expect(TICKET_STATUSES).not.toContain('Duplicate');
  });
});

describe('NEXT_STATUS ladder', () => {
  it('has no entry for Resolved or Rejected (both terminal)', () => {
    expect(NEXT_STATUS.Resolved).toBeUndefined();
    expect(NEXT_STATUS.Rejected).toBeUndefined();
  });

  it('walks Reported -> Under Review -> In Progress -> Resolved and stops', () => {
    expect(NEXT_STATUS.Reported).toBe('Under Review');
    expect(NEXT_STATUS['Under Review']).toBe('In Progress');
    expect(NEXT_STATUS['In Progress']).toBe('Resolved');
  });
});
