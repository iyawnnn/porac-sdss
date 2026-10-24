import { ConflictException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { Sql } from 'postgres';
import type { AdminSession } from '../auth/session.service';
import type { EmailService } from '../citizens/email.service';
import type { Env } from '../config/env';
import type { MediaService } from '../domain/media.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { AdminAuditService } from './admin-audit.service';
import { OperationalAssessmentService } from './operational-assessment.service';
import { TicketsService } from './tickets.service';

// Manuscript revision Phase 3, step 3d. A ticket merged into another keeps
// its old status as history, so every list, count and recalculation that
// treats "active" tickets as open work must leave it out; its own detail
// page stays readable but nothing may change it.

const read = (...path: string[]) =>
  readFileSync(join(__dirname, '..', ...path), 'utf8');
const between = (source: string, start: string, end: string) =>
  source.slice(
    source.indexOf(start),
    source.indexOf(end, source.indexOf(start) + 1),
  );
const count = (source: string, needle: string) =>
  source.split(needle).length - 1;

describe('merged-away tickets are left out of lists, counts and recalculation', () => {
  const tickets = read('admin', 'tickets.service.ts');

  it.each([
    ['the Ticket Queue', 'async getTicketsForAdmin(', 'async getViewCounts('],
    [
      'the queue tab counts',
      'async getViewCounts(',
      'async getTicketsForExport(',
    ],
    ['the admin map', 'async getTicketsGeo(', 'async getTicketDetail('],
    [
      'the priority breakdown demand',
      'async getTicketPriorityContext(',
      'async advanceStatus(',
    ],
  ])('%s', (_label, start, end) => {
    expect(between(tickets, start, end)).toMatch(
      /merged_into_ticket_id IS NULL/,
    );
  });

  it('the CSV export lists them only for status=all, with a Merged into value', () => {
    const exportQuery = between(
      tickets,
      'async getTicketsForExport(',
      'async getTicketsGeo(',
    );
    expect(exportQuery).toContain(
      "AND (t.merged_into_ticket_id IS NULL OR ${status} = 'all')",
    );
    expect(exportQuery).toContain('t.merged_into_ticket_id');
    expect(read('admin', 'reports.service.ts')).toContain(
      "{ header: 'Merged into', value: (r) => r.merged_into_ticket_id }",
    );
  });

  it('the dashboard (active count, barangays, categories, trends, status, workload, deltas)', () => {
    expect(
      count(
        read('admin', 'dashboard.service.ts'),
        'merged_into_ticket_id IS NULL',
      ),
    ).toBe(7);
  });

  it('Barangay Insights (list, top category, KPIs, categories, trend, recent)', () => {
    expect(
      count(
        read('admin', 'barangay-insights.service.ts'),
        'merged_into_ticket_id IS NULL',
      ),
    ).toBe(6);
  });

  it('the Operational Priority recompute (demand and the tickets recalculated)', () => {
    expect(
      count(
        read('domain', 'operational-priority.service.ts'),
        'merged_into_ticket_id IS NULL',
      ),
    ).toBe(2);
  });

  it('the public map', () => {
    const reports = read('reports', 'reports.service.ts');
    expect(
      between(reports, 'async getPublicHazardMapData(', 'return {'),
    ).toContain('AND t.merged_into_ticket_id IS NULL');
  });

  it('related-ticket candidates', () => {
    expect(read('admin', 'related-tickets.service.ts')).toContain(
      'AND t.merged_into_ticket_id IS NULL',
    );
  });

  it("citizen report pages follow the report's own ticket, which a merge moves to the survivor", () => {
    const reports = read('reports', 'reports.service.ts');
    for (const method of ['async getMyReports(', 'async getMyReportDetail(']) {
      const body = between(reports, method, '\n  async ');
      expect(body).toContain('JOIN tickets t ON t.id = r.ticket_id');
    }
  });
});

const MEO: AdminSession = {
  adminId: 1,
  email: 'meo@example.com',
  adminName: 'Meo Staff',
  accountType: 'PERSONNEL',
  isFocal: false,
  office: 'MEO',
};

// Answers by query text; the merged-away ticket #4 was merged into #2.
function fakeSql(answer: (text: string) => unknown[]) {
  const texts: string[] = [];
  const sql = jest.fn((strings: TemplateStringsArray) => {
    const text = strings.join('?');
    texts.push(text);
    return Promise.resolve(answer(text));
  });
  return { sql: sql as unknown as Sql, texts };
}

function ticketsService(sql: Sql) {
  return new TicketsService(
    sql,
    {} as MediaService,
    {} as NotificationsService,
    {} as EmailService,
    {} as ConfigService<Env, true>,
    {} as AdminAuditService,
  );
}

const MERGED_ROW = {
  status: 'Reported',
  assigned_office: 'MEO',
  category: 'Pothole / Road Surface Damage',
  merged_into_ticket_id: 2,
};
const READ_ONLY = new ConflictException(
  'Ticket #4 was merged into Ticket #2 and is read-only.',
);

describe('a merged-away ticket is read-only', () => {
  it.each([
    [
      'advance its status',
      (s: TicketsService) => s.advanceStatus(4, MEO, undefined, undefined),
    ],
    ['reassign it', (s: TicketsService) => s.reassignOffice(4, MEO, 'MDRRMO')],
    [
      'log a referral',
      (s: TicketsService) => s.logReferral(4, MEO, 'MENRO', undefined),
    ],
    ['reject it', (s: TicketsService) => s.rejectTicket(4, MEO, 'Duplicate.')],
  ])('cannot %s (409), and nothing is written', async (_label, act) => {
    const { sql, texts } = fakeSql(() => [MERGED_ROW]);
    await expect(act(ticketsService(sql))).rejects.toThrow(READ_ONLY);
    expect(texts).toHaveLength(1);
  });

  it('cannot get an Operational Assessment (409)', async () => {
    const { sql, texts } = fakeSql(() => [MERGED_ROW]);
    const service = new OperationalAssessmentService(
      sql,
      {} as AdminAuditService,
    );
    await expect(
      service.upsert(4, MEO, {
        observedCondition: 'x',
        safetyImplication: 'x',
        recommendedAction: 'x',
      } as never),
    ).rejects.toThrow(READ_ONLY);
    expect(texts).toHaveLength(1);
  });

  it("its Work Orders can't get a new status (the UPDATE skips a merged-away ticket's)", () => {
    const workOrders = read('admin', 'work-orders.service.ts');
    const setStatus = between(workOrders, 'async setStatus(', '\n  async ');
    expect(setStatus).toContain(
      'NOT EXISTS (SELECT 1 FROM tickets t WHERE t.id = ${workOrders.ticketId} AND t.merged_into_ticket_id IS NOT NULL)',
    );
    expect(between(workOrders, 'async create(', 'async update(')).toContain(
      'assertNotMergedAway(',
    );
  });
});

describe('Ticket Detail shows the merge on both tickets', () => {
  it('the merged-away ticket gets who merged it, when, why and into which ticket', async () => {
    const { sql } = fakeSql((text) => {
      if (text.includes('FROM tickets t\n      JOIN barangays b')) {
        return [
          {
            id: 4,
            category: 'Pothole / Road Surface Damage',
            assigned_office: 'MEO',
            merged_into_ticket_id: 2,
          },
        ];
      }
      if (text.includes("action_type = 'ticket_merged'")) {
        return [
          {
            actor_name: 'Meo Staff',
            created_at: '2026-10-20T03:00:00.000Z',
            reason: 'Same pothole.',
          },
        ];
      }
      return [];
    });
    const detail = await ticketsService(sql).getTicketDetail(4, MEO);
    expect(detail?.mergedInto).toEqual({
      ticketId: 2,
      mergedAt: '2026-10-20T03:00:00.000Z',
      mergedByName: 'Meo Staff',
      reason: 'Same pothole.',
    });
    expect(detail?.mergedFrom).toEqual([]);
  });

  it('the survivor lists the tickets merged into it', async () => {
    const { sql, texts } = fakeSql((text) => {
      if (text.includes('FROM tickets t\n      JOIN barangays b')) {
        return [
          {
            id: 2,
            category: 'Pothole / Road Surface Damage',
            assigned_office: 'MEO',
            merged_into_ticket_id: null,
          },
        ];
      }
      if (text.includes('WHERE merged_into_ticket_id = ?'))
        return [{ id: 4 }, { id: 6 }];
      return [];
    });
    const detail = await ticketsService(sql).getTicketDetail(2, MEO);
    expect(detail?.mergedInto).toBeNull();
    expect(detail?.mergedFrom).toEqual([4, 6]);
    expect(texts.some((t) => t.includes("action_type = 'ticket_merged'"))).toBe(
      false,
    );
  });
});
