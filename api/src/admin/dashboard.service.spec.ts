import { BadRequestException } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import {
  DashboardService,
  parseDashboardRange,
} from './dashboard.service';
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
    );
    await expect(controller.getDashboard('31')).rejects.toThrow(BadRequestException);
  });
});