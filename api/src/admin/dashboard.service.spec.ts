import { BadRequestException } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import {
  DashboardService,
  parseDashboardRange,
  toKpiDelta,
} from './dashboard.service';
import type { ModerationService } from './moderation.service';
import type { WorkOrdersService } from './work-orders.service';
import type { Sql } from 'postgres';

describe('dashboard ranges', () => {
  it.each([['7', 7], ['30', 30], ['90', 90]])(
    'accepts %s days',
    (value, expected) => {
      expect(parseDashboardRange(value)).toBe(expected);
    },
  );

  it.each(['0', '31', '91', 'seven', '7.5'])(
    'rejects unsupported range %s',
    (value) => {
      expect(() => parseDashboardRange(value)).toThrow(BadRequestException);
    },
  );

  it('defaults to 30 days', () => {
    expect(parseDashboardRange()).toBe(30);
  });

  it('uses database date generation and the requested range value', async () => {
    const sql = jest.fn().mockResolvedValue([]) as unknown as Sql;
    const service = new DashboardService(sql);
    await service.getIncidentTrend(7);

    const call = (sql as unknown as jest.Mock).mock.calls.at(-1);
    const query = call[0].join('');
    expect(query).toContain('generate_series');
    expect(query).toContain('COALESCE(counts.report_count, 0)');
    expect(query).toContain('date_range');
    expect(call[1]).toBe(7);
  });

  // Ticket creation deliberately writes no status_history row (see
  // ReportsService.create), so a ticket with no history at or before a date
  // must fall back to 'Reported'. Without that COALESCE the series silently
  // undercounts every date before a ticket's first admin action, which looks
  // like a plausible trend rather than a bug.
  it('treats a ticket with no status history as Reported when replaying a date', async () => {
    const sql = jest.fn().mockResolvedValue([]) as unknown as Sql;
    const service = new DashboardService(sql);
    await service.getActiveTicketTrend(7);

    const query = (sql as unknown as jest.Mock).mock.calls.at(-1)[0].join('');
    expect(query).toContain("'Reported'::ticket_status");
    expect(query).toContain('generate_series');
    expect(query).toContain('ORDER BY sh.changed_at DESC');
  });

  // The as-of boundary must be exclusive of the next day's start, so a
  // change made at 23:59 lands on that date rather than the following one.
  it('bounds each active-ticket date at the start of the following day', async () => {
    const sql = jest.fn().mockResolvedValue([]) as unknown as Sql;
    const service = new DashboardService(sql);
    await service.getActiveTicketTrend(30);

    const query = (sql as unknown as jest.Mock).mock.calls.at(-1)[0].join('');
    expect(query).toContain("sh.changed_at < (dates.date + interval '1 day')");
    expect(query).toContain("st.created_at < (dates.date + interval '1 day')");
  });

  it('reads pending work-order history from work_order_status_history', async () => {
    const sql = jest.fn().mockResolvedValue([]) as unknown as Sql;
    const service = new DashboardService(sql);
    await service.getPendingWorkOrderTrend(7);

    const query = (sql as unknown as jest.Mock).mock.calls.at(-1)[0].join('');
    expect(query).toContain('work_order_status_history');
    expect(query).toContain("status_on_date.status = 'pending'");
    expect(query).toContain("h.changed_at < (dates.date + interval '1 day')");
  });

  it('office-scopes both KPI trend series', async () => {
    const sql = jest.fn().mockResolvedValue([]) as unknown as Sql;
    const service = new DashboardService(sql);

    await service.getActiveTicketTrend(7, 'MEO');
    expect((sql as unknown as jest.Mock).mock.calls.at(-1)).toContain('MEO');

    await service.getPendingWorkOrderTrend(7, 'MDRRMO');
    expect((sql as unknown as jest.Mock).mock.calls.at(-1)).toContain('MDRRMO');
  });

  it('limits category output while retaining the full active total', async () => {
    const sql = jest.fn().mockResolvedValue([]) as unknown as Sql;
    const service = new DashboardService(sql);
    await service.getCategoryDistribution(5);

    const call = (sql as unknown as jest.Mock).mock.calls.at(-1);
    const query = call[0].join('');
    expect(query).toContain('SUM(COUNT(*)) OVER ()::int AS active_total');
    expect(query).toContain('LIMIT');
    expect(call.at(-1)).toBe(5);
  });

  it('rejects an unsupported endpoint range before invoking dependencies', async () => {
    const controller = new DashboardController(
      {} as DashboardService,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(controller.getDashboard('31')).rejects.toThrow(BadRequestException);
  });
});

// The Office Performance Summary is assembled from three already-scoped
// service methods (WorkOrdersService, DashboardService, ModerationService)
// — these tests verify the assembly itself (which office each sub-call
// receives, when the MEO/MDRRMO comparison is computed) rather than
// re-testing those services' own SQL, which have their own spec files.
describe('DashboardController office performance summary assembly', () => {
  function officePerformanceController(counts: Record<string, { pending: number; highUrgency: number; flagged: number }>) {
    const dashboard = {
      getDashboardKpis: jest.fn((office?: 'MEO' | 'MDRRMO') =>
        Promise.resolve({ high_urgency_count: counts[office ?? 'ALL'].highUrgency }),
      ),
    } as unknown as DashboardService;
    const moderation = {
      getModerationStats: jest.fn((office?: 'MEO' | 'MDRRMO') =>
        Promise.resolve({ pending: counts[office ?? 'ALL'].flagged }),
      ),
    } as unknown as ModerationService;
    const workOrders = {
      getOfficePerformanceCounts: jest.fn((office?: 'MEO' | 'MDRRMO') =>
        Promise.resolve({
          pendingWorkOrders: counts[office ?? 'ALL'].pending,
          inProgressWorkOrders: 0,
          overdueWorkOrders: 0,
          completedWorkOrdersThisWeek: 0,
        }),
      ),
    } as unknown as WorkOrdersService;
    const controller = new DashboardController(
      dashboard,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      moderation,
      workOrders,
    );
    return {
      controller: controller as unknown as {
        getOfficePerformanceSummary: (
          office?: 'MEO' | 'MDRRMO',
        ) => Promise<{
          scope: string;
          pendingWorkOrders: number;
          highUrgencyOpenTickets: number;
          flaggedReportsPending: number;
          byOffice: { MEO: { pendingWorkOrders: number } } | null;
        }>;
      },
      dashboard,
      moderation,
      workOrders,
    };
  }

  it('an office-scoped admin (MEO) gets scope MEO, MEO-only counts, and no byOffice comparison', async () => {
    const { controller, workOrders } = officePerformanceController({
      MEO: { pending: 2, highUrgency: 4, flagged: 1 },
      MDRRMO: { pending: 99, highUrgency: 99, flagged: 99 },
    });

    const summary = await controller.getOfficePerformanceSummary('MEO');

    expect(summary.scope).toBe('MEO');
    expect(summary.pendingWorkOrders).toBe(2);
    expect(summary.highUrgencyOpenTickets).toBe(4);
    expect(summary.flaggedReportsPending).toBe(1);
    expect(summary.byOffice).toBeNull();
    // Never touches MDRRMO's data for an MEO-scoped request.
    expect(workOrders.getOfficePerformanceCounts).toHaveBeenCalledTimes(1);
    expect(workOrders.getOfficePerformanceCounts).toHaveBeenCalledWith('MEO');
  });

  it('an office-scoped admin (MDRRMO) never receives MEO data either', async () => {
    const { controller, workOrders } = officePerformanceController({
      MEO: { pending: 99, highUrgency: 99, flagged: 99 },
      MDRRMO: { pending: 6, highUrgency: 3, flagged: 2 },
    });

    const summary = await controller.getOfficePerformanceSummary('MDRRMO');

    expect(summary.scope).toBe('MDRRMO');
    expect(summary.pendingWorkOrders).toBe(6);
    expect(summary.byOffice).toBeNull();
    expect(workOrders.getOfficePerformanceCounts).toHaveBeenCalledTimes(1);
    expect(workOrders.getOfficePerformanceCounts).toHaveBeenCalledWith('MDRRMO');
  });

  it('a system admin (office undefined) gets scope ALL plus a MEO vs MDRRMO comparison', async () => {
    const { controller, workOrders } = officePerformanceController({
      ALL: { pending: 8, highUrgency: 7, flagged: 3 },
      MEO: { pending: 2, highUrgency: 4, flagged: 1 },
      MDRRMO: { pending: 6, highUrgency: 3, flagged: 2 },
    });

    const summary = await controller.getOfficePerformanceSummary(undefined);

    expect(summary.scope).toBe('ALL');
    expect(summary.pendingWorkOrders).toBe(8);
    expect(summary.byOffice).toEqual(
      expect.objectContaining({
        MEO: expect.objectContaining({ pendingWorkOrders: 2 }),
        MDRRMO: expect.objectContaining({ pendingWorkOrders: 6 }),
      }),
    );
    // City-wide + MEO + MDRRMO = 3 calls total for a system admin.
    expect(workOrders.getOfficePerformanceCounts).toHaveBeenCalledTimes(3);
  });
});

// The delta math is the part of getKpiDeltas that can be wrong without any
// database involved, so it is tested directly. The SQL shape is covered by
// the query-string assertions below it, matching how the trend queries in
// this file are verified.
describe('toKpiDelta', () => {
  it('reports a rise as a positive percentage', () => {
    expect(toKpiDelta(107, 100)).toEqual({
      current: 107,
      previous: 100,
      changeAbs: 7,
      changePct: 7,
    });
  });

  it('reports a fall as a negative percentage', () => {
    expect(toKpiDelta(93, 100)).toMatchObject({ changeAbs: -7, changePct: -7 });
  });

  it('rounds the percentage to one decimal place', () => {
    expect(toKpiDelta(10, 3)).toMatchObject({ changePct: 233.3 });
  });

  // A percentage off a zero baseline is undefined, not infinite. The UI
  // falls back to changeAbs, so this must be null rather than 0 (which
  // would render as a confident "no change") or Infinity.
  it('returns a null percentage when the baseline was zero', () => {
    expect(toKpiDelta(5, 0)).toEqual({
      current: 5,
      previous: 0,
      changeAbs: 5,
      changePct: null,
    });
  });

  it('treats an unchanged zero baseline as null, not 0%', () => {
    expect(toKpiDelta(0, 0)).toMatchObject({ changeAbs: 0, changePct: null });
  });
});

describe('getKpiDeltas', () => {
  function queriesFor(office?: 'MEO' | 'MDRRMO') {
    const sql = jest.fn().mockResolvedValue([]) as unknown as Sql;
    const service = new DashboardService(sql);
    return service.getKpiDeltas(office).then(() =>
      (sql as unknown as jest.Mock).mock.calls.map((call) =>
        Array.isArray(call[0]) ? call[0].join('') : String(call[0]),
      ),
    );
  }

  // The whole reason this lives server-side rather than being derived from
  // the range-scoped sparkline series: the baseline must not move with the
  // 7/30/90 toggle.
  it('compares against a fixed 7-day baseline, not the range toggle', async () => {
    const queries = await queriesFor();
    expect(queries.some((q) => q.includes('current_date - 7'))).toBe(true);
    expect(queries.some((q) => q.includes('generate_series'))).toBe(false);
  });

  // Levels vs flows: tickets/work orders compare point-in-time levels,
  // reports compares two 7-day windows.
  it('compares the last 7 days against the 7 before them for reports', async () => {
    const queries = await queriesFor();
    const reports = queries.find((q) => q.includes('FROM reports r'));
    expect(reports).toContain('current_date - 6');
    expect(reports).toContain('current_date - 13');
  });

  it('guards the work-order baseline against missing history', async () => {
    const queries = await queriesFor();
    const workOrders = queries.find((q) => q.includes('work_order_status_history'));
    expect(workOrders).toContain('baseline_covered');
  });

  // Office scoping has to reach every one of the three queries, or an MEO
  // admin sees a city-wide delta under an office-scoped headline.
  it('scopes every query by office', async () => {
    const sql = jest.fn().mockResolvedValue([]) as unknown as Sql;
    const service = new DashboardService(sql);
    await service.getKpiDeltas('MEO');
    const calls = (sql as unknown as jest.Mock).mock.calls;
    const scoped = calls.filter((call) => call.includes('MEO'));
    expect(scoped).toHaveLength(3);
  });
});
