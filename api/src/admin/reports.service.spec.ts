import { BadRequestException } from '@nestjs/common';
import type { ReportExportQueries } from './report-export-queries';
import { ReportsService } from './reports.service';
import type { TicketsService } from './tickets.service';
import type { WorkOrdersService } from './work-orders.service';
import type { ModerationService } from './moderation.service';
import type {
  AdminAuditService,
  LogAdminAuditInput,
} from './admin-audit.service';
import { EXPORT_LIMIT_MESSAGE, EXPORT_ROW_LIMIT } from './export-limit';
import type { AdminSession } from '../auth/session.service';

const MEO_OFFICER: AdminSession = {
  adminId: 1,
  email: 'meo@example.com',
  adminName: 'MEO Officer',
  office: 'MEO',
  accountType: 'PERSONNEL',
  isFocal: false,
};

function makeService(
  overrides: {
    parseTicketQuery?: jest.Mock;
    getTicketsForExport?: jest.Mock;
    parseQuery?: jest.Mock;
    getWorkOrdersForExport?: jest.Mock;
    parseModerationQuery?: jest.Mock;
    getModerationForExport?: jest.Mock;
  } = {},
) {
  const tickets = {
    parseTicketQuery:
      overrides.parseTicketQuery ??
      jest.fn().mockReturnValue({ office: 'MEO' }),
    getTicketsForExport:
      overrides.getTicketsForExport ?? jest.fn().mockResolvedValue([]),
  } as unknown as TicketsService;
  const workOrders = {
    parseQuery:
      overrides.parseQuery ?? jest.fn().mockReturnValue({ office: 'MEO' }),
    getWorkOrdersForExport:
      overrides.getWorkOrdersForExport ?? jest.fn().mockResolvedValue([]),
  } as unknown as WorkOrdersService;
  const moderation = {
    parseModerationQuery:
      overrides.parseModerationQuery ??
      jest.fn().mockReturnValue({ office: 'MEO' }),
    getModerationForExport:
      overrides.getModerationForExport ?? jest.fn().mockResolvedValue([]),
  } as unknown as ModerationService;
  const audit = {
    logRequired: jest
      .fn<Promise<void>, [LogAdminAuditInput]>()
      .mockResolvedValue(undefined),
  };
  return {
    audit,
    service: new ReportsService(
      tickets,
      workOrders,
      moderation,
      audit as unknown as AdminAuditService,
      {} as ReportExportQueries,
    ),
    tickets,
    workOrders,
    moderation,
  };
}

describe('ReportsService.parseDateRange', () => {
  const { service } = makeService();

  it('returns undefined for both bounds when neither is given', () => {
    expect(service.parseDateRange({})).toEqual({
      dateFrom: undefined,
      dateTo: undefined,
    });
  });

  it('parses valid ISO date strings', () => {
    const range = service.parseDateRange({
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
    });
    expect(range.dateFrom).toEqual(new Date('2026-01-01'));
    expect(range.dateTo).toEqual(new Date('2026-01-31'));
  });

  it('rejects an unparseable date string', () => {
    expect(() => service.parseDateRange({ dateFrom: 'not-a-date' })).toThrow(
      BadRequestException,
    );
  });

  it('rejects a dateFrom that is after dateTo', () => {
    expect(() =>
      service.parseDateRange({ dateFrom: '2026-02-01', dateTo: '2026-01-01' }),
    ).toThrow(BadRequestException);
  });
});

describe('ReportsService.ticketsCsv', () => {
  it('delegates filter parsing (and office scoping) to TicketsService.parseTicketQuery', async () => {
    const parseTicketQuery = jest
      .fn()
      .mockReturnValue({ office: 'MEO', status: 'active' });
    const { service, tickets } = makeService({ parseTicketQuery });

    await service.ticketsCsv({ category: 'Pothole' }, MEO_OFFICER);

    expect(parseTicketQuery).toHaveBeenCalledWith(
      { category: 'Pothole' },
      MEO_OFFICER,
    );
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
        category: 'Localized Flooding',
        barangay_name: 'Poblacion',
        priority_index: 64,
        member_count: 3,
        created_at: '2026-01-05T00:00:00.000Z',
        updated_at: '2026-01-06T00:00:00.000Z',
        merged_into_ticket_id: null,
        // Manuscript revision Phase 4, step 4b.
        hazard_summary: 'Flood: MF (Moderate Susceptibility to Flooding)',
        resolution_outcome: null,
        resolved_at: null,
      },
      // A merged-away ticket (manuscript revision Phase 3, step 3d), as a
      // status=all export lists it.
      {
        id: 43,
        status: 'Reported',
        assigned_office: 'MEO',
        category: 'Pothole',
        barangay_name: 'Poblacion',
        priority_index: 40,
        member_count: 1,
        created_at: '2026-01-07T00:00:00.000Z',
        updated_at: '2026-01-08T00:00:00.000Z',
        merged_into_ticket_id: 42,
        hazard_summary: 'Not applicable',
        resolution_outcome: null,
        resolved_at: null,
      },
    ]);
    const { service } = makeService({ getTicketsForExport });

    const csv = await service.ticketsCsv({}, MEO_OFFICER);

    const [header, row, mergedRow] = csv.trim().split('\r\n');
    expect(header).toBe(
      'Ticket ID,Status,Assigned Office,Operational Priority,Category,Hazard Information,Barangay,Report Count,Created At,Updated At,Merged into,Resolution Outcome,Resolved At',
    );
    expect(row).toBe(
      '42,Reported,MEO,64,Localized Flooding,Flood: MF (Moderate Susceptibility to Flooding),Poblacion,3,2026-01-05T00:00:00.000Z,2026-01-06T00:00:00.000Z,,,',
    );
    expect(mergedRow).toBe(
      '43,Reported,MEO,40,Pothole,Not applicable,Poblacion,1,2026-01-07T00:00:00.000Z,2026-01-08T00:00:00.000Z,42,,',
    );
  });

  // Manuscript revision Phase 5, step 5c (decision 13): Resolution Outcome
  // and Resolved At. A legacy Resolved ticket (no resolved_at) exports a
  // blank outcome whatever migration 0036 stored for it; notes never appear.
  it('exports the resolution outcome and resolved time, blank outcome for a legacy Resolved ticket', async () => {
    const base = {
      assigned_office: 'MEO',
      category: 'Pothole',
      barangay_name: 'Poblacion',
      priority_index: 40,
      member_count: 1,
      created_at: '2026-01-07T00:00:00.000Z',
      updated_at: '2026-01-08T00:00:00.000Z',
      merged_into_ticket_id: null,
      hazard_summary: 'Not applicable',
    };
    const getTicketsForExport = jest.fn().mockResolvedValue([
      {
        ...base,
        id: 50,
        status: 'Resolved',
        resolution_outcome: 'EXTERNAL_REFERRAL',
        resolved_at: new Date('2026-01-09T10:00:00.000Z'),
        resolution_notes: 'Referred to DPWH.',
      },
      {
        ...base,
        id: 51,
        status: 'Resolved',
        resolution_outcome: 'MUNICIPAL_ACTION_COMPLETED',
        resolved_at: null,
      },
    ]);
    const { service } = makeService({ getTicketsForExport });

    const csv = await service.ticketsCsv({ status: 'Resolved' }, MEO_OFFICER);

    const [header, current, legacy] = csv.trim().split(/\r?\n/);
    expect(header.endsWith(',Resolution Outcome,Resolved At')).toBe(true);
    expect(
      current.endsWith(',EXTERNAL_REFERRAL,2026-01-09T10:00:00.000Z'),
    ).toBe(true);
    expect(legacy.endsWith(',,')).toBe(true);
    expect(csv).not.toContain('MUNICIPAL_ACTION_COMPLETED');
    expect(csv).not.toContain('Referred to DPWH');
  });

  // Manuscript revision Phase 1, step 4: no Hazard Urgency column or value
  // in the ticket export.
  it('has no Hazard Urgency column', async () => {
    const { service } = makeService({
      getTicketsForExport: jest.fn().mockResolvedValue([]),
    });
    const header = (await service.ticketsCsv({}, MEO_OFFICER)).trim();
    expect(header).not.toMatch(/urgency/i);
  });

  it('produces just a header row when there are no matching tickets', async () => {
    const { service } = makeService({
      getTicketsForExport: jest.fn().mockResolvedValue([]),
    });
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
    const { service } = makeService({
      getWorkOrdersForExport: jest.fn().mockResolvedValue([]),
    });
    const csv = await service.workOrdersCsv({}, MEO_OFFICER);
    expect(csv.trim().split('\r\n')).toHaveLength(1);
  });
});

describe('ReportsService.flaggedCsv', () => {
  it('renders null, empty and populated flags safely', async () => {
    const row = {
        id: 211,
        ticket_id: 1036,
        tracking_reference: 'PORAC-2026-211',
        category: 'Flooding',
        barangay_name: 'Sapang Uwak',
        assigned_office: 'MDRRMO',
        citizen_severity: 'Critical',
        location_mismatch_m: null,
        moderation_status: null,
        moderated_by: null,
        moderated_at: null,
        created_at: '2026-08-20T08:12:00.000Z',
    };
    const getModerationForExport = jest.fn().mockResolvedValue([
      { ...row, flags: null },
      { ...row, flags: [] },
      { ...row, flags: ['ONE', 'TWO'] },
    ]);
    const { service } = makeService({ getModerationForExport });
    const rows = (await service.flaggedCsv({}, MEO_OFFICER)).split('\r\n');
    expect(rows[1].split(',')[7]).toBe('');
    expect(rows[2].split(',')[7]).toBe('');
    expect(rows[3].split(',')[7]).toBe('ONE | TWO');
  });

  it('delegates filter parsing (and office scoping) to ModerationService.parseModerationQuery', async () => {
    const parseModerationQuery = jest
      .fn()
      .mockReturnValue({ office: 'MEO', status: 'pending' });
    const { service, moderation } = makeService({ parseModerationQuery });

    await service.flaggedCsv({ flag: 'MISSING_METADATA' }, MEO_OFFICER);

    expect(parseModerationQuery).toHaveBeenCalledWith(
      { flag: 'MISSING_METADATA' },
      MEO_OFFICER,
    );
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

    await expect(
      service.flaggedCsv({ ids: '211,abc' }, MEO_OFFICER),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('renders flagged rows into stable CSV columns', async () => {
    const getModerationForExport = jest.fn().mockResolvedValue([
      {
        id: 211,
        ticket_id: 1036,
        tracking_reference: 'PORAC-2026-211',
        title: 'PRIVATE_TITLE',
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

    expect(header).toBe(
      'Report ID,Ticket ID,Tracking Reference,Category,Barangay,Assigned Office,Citizen Severity,Flags,Location Mismatch (m),Moderation Status,Moderated By,Moderated At,Submitted At',
    );
    expect(csv).not.toContain('Maria Santos');
    expect(csv).not.toContain('PRIVATE_TITLE');
    expect(row).toContain('PORAC-2026-211');
    expect(header).toContain('Flags');
    expect(row).toContain('211');
    expect(row).toContain('DUPLICATE_IMAGE:96 | LOCATION_MISMATCH');
    // Pending is the absence of a stored decision, not a null cell.
    expect(row).toContain('pending');
  });
});

// Phase 7, step 7.0: every export goes through the central CSV writer, so a
// hostile text value (a citizen-written title or name, a staff-entered work
// order title, assignee name, category or barangay text) can never reach a
// spreadsheet as a live formula. The hostile values below carry no comma, so
// a row splits cleanly on ','. Numeric columns stay plain numbers.
describe('ReportsService exports neutralise CSV formula injection', () => {
  it('tickets.csv: category, barangay and Hazard Information cells start with an apostrophe; numbers stay numeric', async () => {
    const getTicketsForExport = jest.fn().mockResolvedValue([
      {
        id: 42,
        status: 'Reported',
        assigned_office: 'MEO',
        category: '=HYPERLINK("http://evil.example")',
        barangay_name: '+Poblacion',
        priority_index: 64,
        member_count: 3,
        created_at: '2026-01-05T00:00:00.000Z',
        updated_at: '2026-01-06T00:00:00.000Z',
        merged_into_ticket_id: 7,
        hazard_summary: '@SUM(1+1)',
        resolution_outcome: null,
        resolved_at: null,
      },
    ]);
    const { service } = makeService({ getTicketsForExport });

    const csv = await service.ticketsCsv({ status: 'all' }, MEO_OFFICER);
    const [, row] = csv.trim().split('\r\n');

    expect(row).toBe(
      `42,Reported,MEO,64,"'=HYPERLINK(""http://evil.example"")",'@SUM(1+1),'+Poblacion,3,2026-01-05T00:00:00.000Z,2026-01-06T00:00:00.000Z,7,,`,
    );
  });

  it('flagged.csv: title, citizen name, category, barangay, flags and moderator cells start with an apostrophe; the distance stays numeric', async () => {
    const getModerationForExport = jest.fn().mockResolvedValue([
      {
        id: 211,
        ticket_id: 1036,
        tracking_reference: 'PORAC-211',
        title: '=cmd|/C calc!A0',
        category: '-Lahar',
        barangay_name: '@Sapang Uwak',
        assigned_office: 'MDRRMO',
        citizen_name: '+Maria Santos',
        citizen_severity: 'Critical',
        flags: ['=FLAG'],
        location_mismatch_m: 412,
        moderation_status: 'dismissed',
        moderated_by: '\tJane Doe',
        moderated_at: '2026-08-21T08:12:00.000Z',
        created_at: '2026-08-20T08:12:00.000Z',
      },
    ]);
    const { service } = makeService({ getModerationForExport });

    const csv = await service.flaggedCsv({}, MEO_OFFICER);
    const [, row] = csv.trim().split('\r\n');

    expect(row.split(',')).toEqual([
      '211',
      '1036',
      'PORAC-211',
      "'-Lahar",
      "'@Sapang Uwak",
      'MDRRMO',
      'Critical',
      "'=FLAG",
      '412',
      'dismissed',
      "'\tJane Doe",
      '2026-08-21T08:12:00.000Z',
      '2026-08-20T08:12:00.000Z',
    ]);
  });

  it('work-orders.csv: title, assignee name and email cells start with an apostrophe; ids stay numeric', async () => {
    const getWorkOrdersForExport = jest.fn().mockResolvedValue([
      {
        id: 7,
        ticket_id: 42,
        title: '-2+3',
        assigned_office: 'MEO',
        assigned_admin_name: '=Jane Doe',
        assigned_admin_email: '@jane',
        status: 'completed',
        due_date: null,
        completed_at: new Date('2026-01-03T00:00:00.000Z'),
        created_at: new Date('2026-01-01T00:00:00.000Z'),
        updated_at: new Date('2026-01-02T00:00:00.000Z'),
      },
    ]);
    const { service } = makeService({ getWorkOrdersForExport });

    const csv = await service.workOrdersCsv({}, MEO_OFFICER);
    const [, row] = csv.trim().split('\r\n');

    expect(row.split(',')).toEqual([
      '7',
      '42',
      "'-2+3",
      'MEO',
      "'=Jane Doe",
      "'@jane",
      'completed',
      'false',
      '',
      '2026-01-03T00:00:00.000Z',
      '',
      '',
      '',
      '2026-01-01T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z',
    ]);
  });
});

describe('export hardening', () => {
  const ticket = { id: 1, created_at: '2026-01-01', updated_at: '2026-01-01' };
  const flagged = {
    ...ticket,
    flags: [],
    tracking_reference: 'PORAC-1',
    citizen_name: 'PRIVATE CITIZEN',
    title: 'PRIVATE TITLE',
  };
  const workOrder = {
    ...ticket,
    created_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
    status: 'pending',
  };
  const cases = [
    ['ticketsCsv', 'getTicketsForExport', ticket, 'tickets'],
    ['flaggedCsv', 'getModerationForExport', flagged, 'flagged'],
    ['workOrdersCsv', 'getWorkOrdersForExport', workOrder, 'work_orders'],
  ] as const;
  it.each(cases)(
    '%s allows exactly 5,000 and refuses 5,001 without file or audit',
    async (method, getter, row, kind) => {
      const mock = jest
        .fn()
        .mockResolvedValue(Array(EXPORT_ROW_LIMIT).fill(row));
      const { service, audit } = makeService({ [getter]: mock });
      const csv = await service[method]({}, MEO_OFFICER);
      expect(csv.trimEnd().split('\r\n')).toHaveLength(EXPORT_ROW_LIMIT + 1);
      expect(audit.logRequired).toHaveBeenCalledTimes(1);
      expect(audit.logRequired).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'report_exported',
          targetType: 'export',
          targetId: MEO_OFFICER.adminId,
          metadata: {
            kind,
            rowCount: 5000,
            office: 'MEO',
            status:
              kind === 'tickets'
                ? 'active'
                : kind === 'flagged'
                  ? 'pending'
                  : 'all',
            searchApplied: false,
            assigneeFiltered: false,
          },
        }),
      );
      audit.logRequired.mockClear();
      mock.mockResolvedValue(Array(EXPORT_ROW_LIMIT + 1).fill(row));
      await expect(service[method]({}, MEO_OFFICER)).rejects.toThrow(
        EXPORT_LIMIT_MESSAGE,
      );
      expect(audit.logRequired).not.toHaveBeenCalled();
    },
  );
  it.each(cases)('%s fails closed on an audit insert error', async (method) => {
    const { service, audit } = makeService();
    audit.logRequired.mockRejectedValue(new Error('audit unavailable'));
    await expect(service[method]({}, MEO_OFFICER)).rejects.toThrow(
      'audit unavailable',
    );
  });
  it('audits applied scope and safe filters only, without query text or assignee ids', async () => {
    const { service, audit } = makeService({
      parseTicketQuery: jest.fn().mockReturnValue({
        office: 'MEO',
        status: 'Rejected',
        category: 'Localized Flooding',
        barangayId: 1,
        search: 'PRIVATE SEARCH',
        categoryReview: true,
        ignored: 'PRIVATE',
      }),
    });
    await service.ticketsCsv(
      { office: 'MDRRMO', dateFrom: '2026-01-01', ids: '1,2' },
      MEO_OFFICER,
    );
    expect(audit.logRequired.mock.calls[0][0].metadata).toEqual({
      kind: 'tickets',
      rowCount: 0,
      office: 'MEO',
      status: 'Rejected',
      category: 'LOCALIZED_FLOODING',
      barangayId: 1,
      categoryReview: true,
      dateFrom: '2026-01-01T00:00:00.000Z',
      searchApplied: true,
      assigneeFiltered: false,
      selectionCount: 2,
    });
    expect(
      JSON.stringify(audit.logRequired.mock.calls[0][0].metadata),
    ).not.toContain('PRIVATE');
  });
  it('includes cancellation columns only for cancelled orders and never notes', async () => {
    const cancelled = {
      ...workOrder,
      id: 2,
      status: 'cancelled',
      cancelled_at: new Date('2026-01-02'),
      cancellation_reason: 'Replaced',
      replacement_work_order_id: 3,
      notes: 'PRIVATE NOTE',
    };
    const { service } = makeService({
      getWorkOrdersForExport: jest
        .fn()
        .mockResolvedValue([workOrder, cancelled]),
    });
    const csv = await service.workOrdersCsv({}, MEO_OFFICER);
    const [header, active, stopped] = csv
      .split('\r\n')
      .map((row) => row.split(','));
    expect(header).toEqual([
      'Work Order ID',
      'Ticket ID',
      'Title',
      'Assigned Office',
      'Assigned Admin Name',
      'Assigned Admin Email',
      'Status',
      'Overdue',
      'Due Date',
      'Completed At',
      'Cancelled At',
      'Cancellation Reason',
      'Replacement Work Order ID',
      'Created At',
      'Updated At',
    ]);
    expect(active.slice(10, 13)).toEqual(['', '', '']);
    expect(stopped.slice(10, 13)).toEqual([
      '2026-01-02T00:00:00.000Z',
      'Replaced',
      '3',
    ]);
    expect(csv).not.toContain('PRIVATE NOTE');
  });
});
