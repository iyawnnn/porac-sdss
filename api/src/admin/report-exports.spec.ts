import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ReportsService } from './reports.service';
import {
  parseExportTop,
  parseReportExportFilters,
  type ReportExportQueries,
} from './report-export-queries';
import type { TicketsService } from './tickets.service';
import type { WorkOrdersService } from './work-orders.service';
import type { ModerationService } from './moderation.service';
import type {
  AdminAuditService,
  LogAdminAuditInput,
} from './admin-audit.service';
import type { AdminSession } from '../auth/session.service';
import { EXPORT_LIMIT_MESSAGE } from './export-limit';
import { auditDetails } from './admin-audit-view';

const actor: AdminSession = {
  adminId: 1,
  adminName: 'MEO Staff',
  email: 'staff@test',
  accountType: 'PERSONNEL',
  isFocal: false,
  office: 'MEO',
};
const base = {
  ticket_id: 1,
  assigned_office: 'MEO',
  status: 'Reported',
  category: 'Localized Flooding',
  priority_index: 80,
  resolution_outcome: null,
  resolved_at: null,
};
const submitted = {
  ...base,
  tracking_reference: 'PRC-2026-1',
  submitted_category: 'Pothole / Road Surface Damage',
  barangay_name: 'Jalung',
  citizen_severity: 'High',
  flags: ['MISSING_METADATA'],
  severity_screening_status: 'NOT_REVIEWED',
  moderation_status: null,
  created_at: '2026-01-01T16:00:00.000Z',
};
const assessment = {
  ...base,
  created_at: '2026-01-01T16:00:00.000Z',
  assessed_by_name: 'Staff Snapshot',
  assessed_conditions: '=ASSESS_CONDITIONS',
  safety_implications: 'SAFETY',
  operational_constraints: {
    selected: ['b', 'a'],
    notes: { b: 'note B', a: 'note A' },
  },
  recommended_action: 'RECOMMEND',
  interim_mitigation: '@MITIGATION',
  deferment_or_referral_reason: 'Deferment: DEFER\nReferral: REFER',
  remarks: 'STAFF_REMARKS',
  actual_action: 'ACTUAL',
  supporting_evidence_url: 'https://staff.test/evidence',
  pending: 1,
  in_progress: 2,
  completed: 3,
  cancelled: 4,
};
const priority = {
  ...base,
  barangay_name: 'Jalung',
  member_count: 2,
  created_at: submitted.created_at,
  updated_at: submitted.created_at,
  hazard_summary: 'Flood: Not yet checked',
};
const headers = {
  submittedReportsCsv:
    'Tracking Reference,Ticket ID,Ticket Status,Assigned Office,Category,Submitted Category,Barangay,Citizen Severity,Evidence Flags,Severity Screening Status,Moderation Status,Submitted At',
  operationalAssessmentsCsv:
    'Ticket ID,Assigned Office,Category,Ticket Status,Operational Priority,Resolution Outcome,Resolved At,Assessed At,Assessed By,Assessed Conditions,Safety Implications,Operational Constraints,Constraint Notes,Recommended Action,Interim Mitigation,Deferment or Referral Reason,Remarks,Actual Action,Supporting Evidence URL,Work Orders Pending,Work Orders In Progress,Work Orders Completed,Work Orders Cancelled',
  priorityIncidentsCsv:
    'Rank,Ticket ID,Status,Assigned Office,Operational Priority,Category,Hazard Information,Barangay,Report Count,Created At,Updated At',
};

function setup() {
  const queries = {
    submitted: jest.fn().mockResolvedValue([submitted]),
    assessments: jest.fn().mockResolvedValue([assessment]),
    priority: jest.fn().mockResolvedValue([priority]),
  };
  const audit = {
    logRequired: jest
      .fn<Promise<void>, [LogAdminAuditInput]>()
      .mockResolvedValue(undefined),
  };
  const service = new ReportsService(
    {} as TicketsService,
    {} as WorkOrdersService,
    {} as ModerationService,
    audit as unknown as AdminAuditService,
    queries as unknown as ReportExportQueries,
  );
  return { service, queries, audit };
}
const cases = [
  ['submittedReportsCsv', 'submitted_reports'],
  ['operationalAssessmentsCsv', 'operational_assessments'],
  ['priorityIncidentsCsv', 'priority_incidents'],
] as const;

describe('Phase 7c-2 CSV contracts', () => {
  it.each(cases)(
    '%s pins every column and audits the generated row',
    async (method, kind) => {
      const { service, audit } = setup();
      const csv = await service[method]({}, actor);
      expect(csv.split('\r\n')[0]).toBe(headers[method]);
      expect(audit.logRequired).toHaveBeenCalledTimes(1);
      const input = audit.logRequired.mock.calls[0][0];
      expect(input.actionType).toBe('report_exported');
      expect(input.targetType).toBe('export');
      expect(input.targetId).toBe(actor.adminId);
      expect(input.metadata).toEqual({
        kind,
        rowCount: 1,
        office: 'MEO',
        status: method === 'priorityIncidentsCsv' ? 'active' : 'all',
        ...(method === 'priorityIncidentsCsv' ? { top: 20 } : {}),
        searchApplied: false,
        assigneeFiltered: false,
      });
    },
  );
  it('submitted reports never serialize forbidden citizen/evidence text or screening remarks', async () => {
    const { service, queries } = setup();
    const privateValues = {
      citizen_name: 'PRIVATE_NAME',
      email: 'PRIVATE_EMAIL',
      title: 'PRIVATE_TITLE',
      description: 'PRIVATE_DESCRIPTION',
      photo_url: 'PRIVATE_PHOTO_URL',
      exif_data: 'PRIVATE_EXIF',
      lat: '15.123456',
      lng: '120.123456',
      severity_screening_remarks: 'PRIVATE_SCREENING_REMARKS',
    };
    queries.submitted.mockResolvedValue([{ ...submitted, ...privateValues }]);
    const csv = await service.submittedReportsCsv({}, actor);
    for (const value of Object.values(privateValues))
      expect(csv).not.toContain(value);
    expect(csv).toContain(submitted.tracking_reference);
    expect(csv).toContain('pending');
  });
  it('submitted reports render null, empty and populated flags safely', async () => {
    const { service, queries } = setup();
    queries.submitted.mockResolvedValue([
      { ...submitted, flags: null },
      { ...submitted, flags: [] },
      { ...submitted, flags: ['ONE', 'TWO'] },
    ]);
    const rows = (await service.submittedReportsCsv({}, actor)).split('\r\n');
    expect(rows[1].split(',')[8]).toBe('');
    expect(rows[2].split(',')[8]).toBe('');
    expect(rows[3].split(',')[8]).toBe('ONE; TWO');
  });
  it('assessment text, manuscript headers, flattened notes and formula neutralisation are retained', async () => {
    const { service, audit } = setup();
    const csv = await service.operationalAssessmentsCsv({}, actor);
    for (const text of [
      "'=ASSESS_CONDITIONS",
      "'@MITIGATION",
      'SAFETY',
      'b; a',
      'a: note A; b: note B',
      'RECOMMEND',
      'DEFER',
      'REFER',
      'STAFF_REMARKS',
      'ACTUAL',
      'https://staff.test/evidence',
    ])
      expect(csv).toContain(text);
    expect(csv).not.toContain('Observed Conditions');
    expect(csv).not.toContain('Temporary Mitigation');
    expect(csv.trimEnd()).toMatch(/,1,2,3,4$/);
    expect(
      JSON.stringify(audit.logRequired.mock.calls[0][0].metadata),
    ).not.toMatch(
      /ASSESS_CONDITIONS|MITIGATION|STAFF_REMARKS|note A|staff.test/,
    );
  });
  it.each(cases)('%s fails closed on audit failure', async (method) => {
    const { service, audit } = setup();
    audit.logRequired.mockRejectedValue(new Error('audit unavailable'));
    await expect(service[method]({}, actor)).rejects.toThrow(
      'audit unavailable',
    );
  });
  it.each(cases)(
    '%s refuses Focal and System Administrator before any query',
    async (method) => {
      const { service, queries } = setup();
      for (const forbidden of [
        { ...actor, isFocal: true, office: 'MDRRMO' as const },
        { ...actor, accountType: 'SYSTEM_ADMIN' as const, office: null },
      ])
        await expect(service[method]({}, forbidden)).rejects.toBeInstanceOf(
          ForbiddenException,
        );
      for (const query of Object.values(queries))
        expect(query).not.toHaveBeenCalled();
    },
  );
  it.each([
    ['submittedReportsCsv', 'submitted', submitted],
    ['operationalAssessmentsCsv', 'assessments', assessment],
  ] as const)(
    '%s allows 5,000 and refuses 5,001 without audit',
    async (method, getter, row) => {
      const { service, audit, queries } = setup();
      queries[getter].mockResolvedValue(Array(5000).fill(row));
      expect(
        (await service[method]({}, actor)).trimEnd().split('\r\n'),
      ).toHaveLength(5001);
      audit.logRequired.mockClear();
      queries[getter].mockResolvedValue(Array(5001).fill(row));
      await expect(service[method]({}, actor)).rejects.toThrow(
        EXPORT_LIMIT_MESSAGE,
      );
      expect(audit.logRequired).not.toHaveBeenCalled();
    },
  );
  it('records applied validated filters as codes and Manila days, never the requested other office', async () => {
    const { service, audit, queries } = setup();
    await service.submittedReportsCsv(
      {
        office: 'MDRRMO',
        status: 'Rejected',
        category: 'Localized Flooding',
        barangayId: '1',
        dateFrom: '2026-01-02',
        dateTo: '2026-01-02',
      },
      actor,
    );
    expect(queries.submitted).toHaveBeenCalledWith(
      expect.objectContaining({
        office: 'MEO',
        since: '2026-01-01T16:00:00.000Z',
        until: '2026-01-02T16:00:00.000Z',
      }),
    );
    expect(audit.logRequired.mock.calls[0][0].metadata).toEqual({
      kind: 'submitted_reports',
      rowCount: 1,
      office: 'MEO',
      status: 'Rejected',
      category: 'LOCALIZED_FLOODING',
      barangayId: 1,
      dateFrom: '2026-01-02',
      dateTo: '2026-01-02',
      searchApplied: false,
      assigneeFiltered: false,
    });
  });
});

describe('new export validation', () => {
  it('audit projection accepts only bounded numeric Top N and structured export details', () => {
    for (const top of [0, 201, 1.5, '20', 'PRIVATE'])
      expect(auditDetails('report_exported', { top })).toEqual({});
    expect(
      auditDetails('report_exported', {
        kind: 'priority_incidents',
        top: 200,
        rowCount: 2,
        office: 'MEO',
        remarks: 'PRIVATE',
      }),
    ).toEqual({
      kind: 'priority_incidents',
      top: 200,
      rowCount: 2,
      office: 'MEO',
    });
  });
  it.each(['0', '201', 'abc', '1.5', '20.0', '-1', '', ' 20 '])(
    'refuses top=%s with plain 400',
    async (top) => {
      const { service, queries } = setup();
      await expect(
        service.priorityIncidentsCsv({ top }, actor),
      ).rejects.toMatchObject({
        status: 400,
        message: 'Top N must be an integer from 1 to 200.',
      });
      expect(queries.priority).not.toHaveBeenCalled();
    },
  );
  it.each([
    [undefined, 20],
    ['1', 1],
    ['20', 20],
    ['200', 200],
  ] as const)('accepts top=%s as %s', async (raw, top) => {
    const { service, queries, audit } = setup();
    expect(parseExportTop(raw)).toBe(top);
    await service.priorityIncidentsCsv({ top: raw, office: 'MDRRMO' }, actor);
    expect(queries.priority).toHaveBeenCalledWith('MEO', top);
    expect(audit.logRequired.mock.calls[0][0].metadata?.top).toBe(top);
  });
  it.each([
    { status: 'bad' },
    { category: 'bad' },
    { barangayId: '0' },
    { barangayId: '1.5' },
    { dateFrom: '2026-02-30' },
    { dateFrom: 'bad' },
    { dateFrom: '2026-01-02', dateTo: '2026-01-01' },
  ])('rejects invalid filters %j', (query) => {
    expect(() => parseReportExportFilters(query, actor, true)).toThrow(
      BadRequestException,
    );
  });
});
