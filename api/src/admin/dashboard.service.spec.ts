import { BadRequestException } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import {
  DashboardService,
  parseDashboardRange,
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