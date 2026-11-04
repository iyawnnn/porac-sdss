import { readFileSync } from 'fs';
import { join } from 'path';
import {
  ACKNOWLEDGED,
  BACK_UNDER_REVIEW,
  FEEDBACK_RECEIVED,
  notifyTicketCitizens,
  referredNotice,
  reassignedNotice,
  resolvedNotice,
} from './citizen-notices';
import type { TransactionSql } from 'postgres';
import type { NotificationsService } from './notifications.service';
import {
  reportResolvedEmailHtml,
  reportRejectedEmailHtml,
} from '../citizens/email-templates';

describe('citizen notification copy', () => {
  it.each([
    reassignedNotice('MEO'),
    referredNotice('DPWH'),
    BACK_UNDER_REVIEW,
    ACKNOWLEDGED,
  ])(
    'fans out $type once to each distinct reporter, with only own-report links',
    async (notice) => {
      const query = jest
        .fn<
          Promise<{ citizen_id: number; report_id: number }[]>,
          [TemplateStringsArray, ...unknown[]]
        >()
        .mockResolvedValue([
          { citizen_id: 1, report_id: 11 },
          { citizen_id: 2, report_id: 13 },
        ]);
      const tx = Object.assign(query, {
        savepoint: (cb: (sp: TransactionSql) => Promise<unknown>) =>
          cb(tx as unknown as TransactionSql),
      });
      const createInTx = jest
        .fn<
          Promise<void>,
          [
            TransactionSql,
            import('./notifications.service').CreateNotificationInput,
          ]
        >()
        .mockResolvedValue(undefined);
      await notifyTicketCitizens(
        tx as unknown as TransactionSql,
        { createInTx } as unknown as NotificationsService,
        100,
        notice,
      );
      const sql = query.mock.calls[0][0].join('?');
      expect(sql).toContain('DISTINCT ON (r.citizen_id)');
      expect(sql).toContain('t.merged_into_ticket_id IS NULL');
      expect(createInTx.mock.calls.map((c) => c[1])).toEqual([
        {
          recipientType: 'citizen',
          recipientId: 1,
          ...notice,
          href: '/dashboard/reports/11',
          entityType: 'report',
          entityId: 11,
        },
        {
          recipientType: 'citizen',
          recipientId: 2,
          ...notice,
          href: '/dashboard/reports/13',
          entityType: 'report',
          entityId: 13,
        },
      ]);
    },
  );

  it('isolates a notification error without failing the action', async () => {
    const query = jest
      .fn()
      .mockResolvedValue([{ citizen_id: 1, report_id: 11 }]);
    const tx = Object.assign(query, {
      savepoint: (cb: (sp: TransactionSql) => Promise<unknown>) =>
        cb(tx as unknown as TransactionSql),
    });
    const createInTx = jest.fn().mockRejectedValue(new Error('storage failed'));
    await expect(
      notifyTicketCitizens(
        tx as unknown as TransactionSql,
        { createInTx } as unknown as NotificationsService,
        100,
        ACKNOWLEDGED,
      ),
    ).resolves.toHaveLength(1);
  });
  it('pins all five event texts', () => {
    expect(reassignedNotice('MEO')).toEqual({
      type: 'ticket_reassigned',
      title: 'Report routed',
      message:
        'Your report has been routed to the Municipal Engineering Office.',
    });
    expect(reassignedNotice('MDRRMO').message).toBe(
      'Your report has been routed to the Municipal Disaster Risk Reduction and Management Office.',
    );
    expect(referredNotice('DPWH')).toEqual({
      type: 'ticket_referred',
      title: 'Report referred',
      message: 'Your report has been referred to DPWH.',
    });
    expect(BACK_UNDER_REVIEW).toEqual({
      type: 'ticket_returned_to_review',
      title: 'Back under review',
      message: 'Your report is back under review by the assigned office.',
    });
    expect(ACKNOWLEDGED).toEqual({
      type: 'ticket_acknowledged',
      title: 'Report acknowledged',
      message: 'Your report has been acknowledged by municipal monitoring.',
    });
    expect(FEEDBACK_RECEIVED).toEqual({
      type: 'resolution_feedback_received',
      title: 'Feedback received',
      message: 'Thank you. Your feedback was received.',
    });
  });

  it.each([
    'MENRO',
    'DPWH',
    'Water utility provider',
    'Electric utility provider',
    'Barangay office',
  ])('uses the report-page agency mapping: %s', (agency) => {
    expect(referredNotice(agency.toLowerCase()).message).toBe(
      `Your report has been referred to ${agency}.`,
    );
  });
  it.each([null, 'Other', 'Staff-only typed agency'])(
    'does not publish an unrecorded or typed agency: %s',
    (agency) => {
      expect(referredNotice(agency).message).toBe(
        'Your report has been referred to an outside agency.',
      );
    },
  );

  it.each([
    [
      'MUNICIPAL_ACTION_COMPLETED',
      'HANDLED_BY_MUNICIPALITY',
      'Your report has been handled by the municipality.',
    ],
    [
      'EXTERNAL_REFERRAL',
      'REFERRED_OUTSIDE',
      "Your report has been referred to an outside agency. The municipality's handling is complete. The agency may not have resolved the issue yet.",
    ],
  ] as const)(
    'pins the resolved notice and email for %s',
    (code, outcome, text) => {
      expect(
        resolvedNotice({
          status: 'Resolved',
          resolvedAt: '2026-11-04',
          outcomeCode: code,
        }).message,
      ).toBe(text);
      expect(
        reportResolvedEmailHtml(
          'https://example.test/dashboard/reports/1',
          outcome,
        ),
      ).toContain(text);
    },
  );
  it('keeps both legacy generic texts, including an outcome without resolved_at', () => {
    for (const outcomeCode of [
      null,
      'MUNICIPAL_ACTION_COMPLETED',
      'EXTERNAL_REFERRAL',
    ]) {
      expect(
        resolvedNotice({ status: 'Resolved', resolvedAt: null, outcomeCode })
          .message,
      ).toBe('Your report has been marked resolved.');
    }
    expect(
      resolvedNotice({
        status: 'Resolved',
        resolvedAt: '2026-11-04',
        outcomeCode: null,
      }).message,
    ).toBe('Your report has been marked resolved.');
    expect(reportResolvedEmailHtml('/dashboard/reports/1')).toContain(
      'Good news — the report you submitted has been marked resolved by the assigned office.',
    );
    expect(
      reportRejectedEmailHtml('/dashboard/reports/1', 'Staff rejection reason'),
    ).toContain('Staff rejection reason');
  });

  it('scans only notice builders and the resolved email for staff-text interpolation', () => {
    const builders = readFileSync(
      join(__dirname, 'citizen-notices.ts'),
      'utf8',
    );
    const templates = readFileSync(
      join(__dirname, '../citizens/email-templates.ts'),
      'utf8',
    );
    const resolved = templates.slice(
      templates.indexOf('export function reportResolvedEmailHtml'),
      templates.indexOf('export function reportRejectedEmailHtml'),
    );
    for (const source of [builders, resolved]) {
      expect(source).not.toMatch(
        /\b(admin_name|adminName|reason|remarks|resolution_notes|resolutionNotes)\b/,
      );
    }
    const tickets = readFileSync(
      join(__dirname, '../admin/tickets.service.ts'),
      'utf8',
    );
    const calls =
      tickets.match(
        /(?:notifyTicketCitizens|sendReportResolved)\([\s\S]*?\);/g,
      ) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(4);
    for (const call of calls)
      expect(call).not.toMatch(
        /\b(admin_name|adminName|reason|routingReason|remarks|trimmedRemarks|resolution_notes|notes|notesInput)\b/,
      );
    const focal = readFileSync(
      join(__dirname, '../admin/focal-intake.service.ts'),
      'utf8',
    );
    expect(focal).not.toMatch(/type:\s*'report_acknowledged'/);
  });
});
