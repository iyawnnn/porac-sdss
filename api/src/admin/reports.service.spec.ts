import { BadRequestException } from '@nestjs/common';
import { ReportsService } from './reports.service';
import type { TicketsService } from './tickets.service';
import type { WorkOrdersService } from './work-orders.service';
import type { ModerationService } from './moderation.service';
import type { AdminSession } from '../auth/session.service';

const MEO_OFFICER: AdminSession = {
  adminId: 1,
  email: 'meo@example.com',
  adminName: 'MEO Officer',
  office: 'MEO',
  role: 'officer',
};

function makeService(overrides: {
  parseTicketQuery?: jest.Mock;
  getTicketsForExport?: jest.Mock;
  parseQuery?: jest.Mock;
  getWorkOrdersForExport?: jest.Mock;
  parseModerationQuery?: jest.Mock;
  getModerationForExport?: jest.Mock;
} = {}) {
  const tickets = {
    parseTicketQuery: overrides.parseTicketQuery ?? jest.fn().mockReturnValue({ office: 'MEO' }),
    getTicketsForExport: overrides.getTicketsForExport ?? jest.fn().mockResolvedValue([]),
  } as unknown as TicketsService;
  const workOrders = {
    parseQuery: overrides.parseQuery ?? jest.fn().mockReturnValue({ office: 'MEO' }),
    getWorkOrdersForExport: overrides.getWorkOrdersForExport ?? jest.fn().mockResolvedValue([]),
  } as unknown as WorkOrdersService;
  const moderation = {
    parseModerationQuery:
      overrides.parseModerationQuery ?? jest.fn().mockReturnValue({ office: 'MEO' }),
    getModerationForExport:
      overrides.getModerationForExport ?? jest.fn().mockResolvedValue([]),
  } as unknown as ModerationService;
  return {
    service: new ReportsService(tickets, workOrders, moderation),
    tickets,
    workOrders,
    moderation,
  };
}

describe('ReportsService.parseDateRange', () => {
  const { service } = makeService();

  it('returns undefined for both bounds when neither is given', () => {
    expect(service.parseDateRange({})).toEqual({ dateFrom: undefined, dateTo: undefined });
  });

  it('parses valid ISO date strings', () => {
    const range = service.parseDateRange({ dateFrom: '2026-01-01', dateTo: '2026-01-31' });
    expect(range.dateFrom).toEqual(new Date('2026-01-01'));
    expect(range.dateTo).toEqual(new Date('2026-01-31'));
  });

  it('rejects an unparseable date string', () => {
    expect(() => service.parseDateRange({ dateFrom: 'not-a-date' })).toThrow(BadRequestException);
  });

  it('rejects a dateFrom that is after dateTo', () => {
    expect(() => service.parseDateRange({ dateFrom: '2026-02-01', dateTo: '2026-01-01' })).toThrow(
      BadRequestException,
    );
  });
});

describe('ReportsService.ticketsCsv', () => {
  it('delegates filter parsing (and office scoping) to TicketsService.parseTicketQuery', async () => {
    const parseTicketQuery = jest.fn().mockReturnValue({ office: 'MEO', status: 'active' });
    const { service, tickets } = makeService({ parseTicketQuery });

    await service.ticketsCsv({ category: 'Pothole' }, MEO_OFFICER);

    expect(parseTicketQuery).toHaveBeenCalledWith({ category: 'Pothole' }, MEO_OFFICER);
    expect(tickets.getTicketsForExport).toHaveBeenCalledWith(
      expect.objectContaining({ office: 'MEO', status: 'active' }),
    );
  });

  it('renders ticket rows into stable CSV columns', async () => {
    const getTicketsForExport = jest.fn().mockResolvedValue([
      {
        id: 42,
        status: 'Reported',
        assigned_office: 'MEO',
        category: 'Pothole',
        barangay_name: 'Poblacion',
        urgency_band: 'High',
        priority_score: 87,
        member_count: 3,
        created_at: '2026-01-05T00:00:00.000Z',
        updated_at: '2026-01-06T00:00:00.000Z',
      },
    ]);
    const { service } = makeService({ getTicketsForExport });

    const csv = await service.ticketsCsv({}, MEO_OFFICER);

    const [header, row] = csv.trim().split('\r\n');
    expect(header).toBe(
      'Ticket ID,Status,Assigned Office,Urgency Band,Hazard Urgency Score,Category,Barangay,Report Count,Created At,Updated At',
    );
    expect(row).toBe('42,Reported,MEO,High,87,Pothole,Poblacion,3,2026-01-05T00:00:00.000Z,2026-01-06T00:00:00.000Z');
  });

  it('produces just a header row when there are no matching tickets', async () => {
    const { service } = makeService({ getTicketsForExport: jest.fn().mockResolvedValue([]) });
    const csv = await service.ticketsCsv({}, MEO_OFFICER);
    expect(csv.trim().split('\r\n')).toHaveLength(1);
  });
});

describe('ReportsService.workOrdersCsv', () => {
  it('delegates filter parsing (and office scoping) to WorkOrdersService.parseQuery', async () => {
    const parseQuery = jest.fn().mockReturnValue({ office: 'MEO' });
    const { service, workOrders } = makeService({ parseQuery });

    await service.workOrdersCsv({ status: 'pending' }, MEO_OFFICER);

    expect(parseQuery).toHaveBeenCalledWith({ status: 'pending' }, MEO_OFFICER);
    expect(workOrders.getWorkOrdersForExport).toHaveBeenCalledWith(
      expect.objectContaining({ office: 'MEO' }),
    );
  });

  it('never includes a notes column, even though the row type has no notes field to leak', async () => {
    const getWorkOrdersForExport = jest.fn().mockResolvedValue([
      {
        id: 7,
        ticket_id: 42,
        title: 'Clear drainage',
        assigned_office: 'MEO',
        assigned_admin_name: 'Jane Doe',
        assigned_admin_email: 'jane@porac.gov.ph',
        status: 'in_progress',
        due_date: new Date('2020-01-01T00:00:00.000Z'),
        completed_at: null,
        created_at: new Date('2026-01-01T00:00:00.000Z'),
        updated_at: new Date('2026-01-02T00:00:00.000Z'),
      },
    ]);
    const { service } = makeService({ getWorkOrdersForExport });

    const csv = await service.workOrdersCsv({}, MEO_OFFICER);
    const [header] = csv.trim().split('\r\n');
    expect(header.toLowerCase()).not.toContain('notes');
  });

  it('derives Overdue as true for a past due date on a non-terminal status', async () => {
    const getWorkOrdersForExport = jest.fn().mockResolvedValue([
      {
        id: 1,
        ticket_id: 1,
        title: 'Overdue task',
        assigned_office: 'MEO',
        assigned_admin_name: null,
        assigned_admin_email: null,
        status: 'pending',
        due_date: new Date('2020-01-01T00:00:00.000Z'),
        completed_at: null,
        created_at: new Date('2026-01-01T00:00:00.000Z'),
        updated_at: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);
    const { service } = makeService({ getWorkOrdersForExport });

    const csv = await service.workOrdersCsv({}, MEO_OFFICER);
    expect(csv).toContain(',true,');
  });

  it('derives Overdue as false for a past due date once the work order is completed', async () => {
    const getWorkOrdersForExport = jest.fn().mockResolvedValue([
      {
        id: 1,
        ticket_id: 1,
        title: 'Finished task',
        assigned_office: 'MEO',
        assigned_admin_name: null,
        assigned_admin_email: null,
        status: 'completed',
        due_date: new Date('2020-01-01T00:00:00.000Z'),
        completed_at: new Date('2020-06-01T00:00:00.000Z'),
        created_at: new Date('2026-01-01T00:00:00.000Z'),
        updated_at: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);
    const { service } = makeService({ getWorkOrdersForExport });

    const csv = await service.workOrdersCsv({}, MEO_OFFICER);
    expect(csv).toContain(',false,');
  });

  it('produces just a header row when there are no matching work orders', async () => {
    const { service } = makeService({ getWorkOrdersForExport: jest.fn().mockResolvedValue([]) });
    const csv = await service.workOrdersCsv({}, MEO_OFFICER);
    expect(csv.trim().split('\r\n')).toHaveLength(1);
  });
});

describe('ReportsService.flaggedCsv', () => {
  it('delegates filter parsing (and office scoping) to ModerationService.parseModerationQuery', async () => {
    const parseModerationQuery = jest
      .fn()
      .mockReturnValue({ office: 'MEO', status: 'pending' });
    const { service, moderation } = makeService({ parseModerationQuery });

    await service.flaggedCsv({ flag: 'NO_EXIF' }, MEO_OFFICER);

    expect(parseModerationQuery).toHaveBeenCalledWith({ flag: 'NO_EXIF' }, MEO_OFFICER);
    expect(moderation.getModerationForExport).toHaveBeenCalledWith(
      expect.objectContaining({ office: 'MEO', status: 'pending' }),
    );
  });

  // The export must not become a second authorization path: a caller asking
  // for the other office still gets whatever resolveOfficeScope clamped them
  // to inside parseModerationQuery, never the office they typed.
  it('never widens office scope past what the parser returned', async () => {
    const parseModerationQuery = jest.fn().mockReturnValue({ office: 'MEO' });
    const { service, moderation } = makeService({ parseModerationQuery });

    await service.flaggedCsv({ office: 'MDRRMO' }, MEO_OFFICER);

    expect(moderation.getModerationForExport).toHaveBeenCalledWith(
      expect.objectContaining({ office: 'MEO' }),
    );
  });

  it('passes an explicit selection through as an id whitelist', async () => {
    const { service, moderation } = makeService();

    await service.flaggedCsv({ ids: '211, 215,211' }, MEO_OFFICER);

    expect(moderation.getModerationForExport).toHaveBeenCalledWith(
      expect.objectContaining({ ids: [211, 215] }),
    );
  });

  it('rejects a malformed id list', async () => {
    const { service } = makeService();

    await expect(service.flaggedCsv({ ids: '211,abc' }, MEO_OFFICER)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('renders flagged rows into stable CSV columns', async () => {
    const getModerationForExport = jest.fn().mockResolvedValue([
      {
        id: 211,
        ticket_id: 1036,
        title: 'Lahar / Debris-Flow Threat in Sapang Uwak',
        category: 'Lahar / Debris-Flow Threat',
        barangay_name: 'Sapang Uwak',
        assigned_office: 'MDRRMO',
        citizen_name: 'Maria Santos',
        citizen_severity: 'Critical',
        flags: ['DUPLICATE_IMAGE:96', 'LOCATION_MISMATCH'],
        location_mismatch_m: 412,
        moderation_status: null,
        moderated_by: null,
        moderated_at: null,
        created_at: '2026-08-20T08:12:00.000Z',
      },
    ]);
    const { service } = makeService({ getModerationForExport });

    const csv = await service.flaggedCsv({}, MEO_OFFICER);
    const [header, row] = csv.trim().split('\r\n');

    expect(header).toContain('Report ID');
    expect(header).toContain('Flags');
    expect(row).toContain('211');
    expect(row).toContain('DUPLICATE_IMAGE:96 | LOCATION_MISMATCH');
    // Pending is the absence of a stored decision, not a null cell.
    expect(row).toContain('pending');
  });
});
