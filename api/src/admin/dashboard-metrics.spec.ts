import { shapeOperationalMetrics } from './dashboard-metrics';
import { DashboardService } from './dashboard.service';
import type { Sql } from 'postgres';

describe('operational metric shaping', () => {
  it('returns zero buckets and a null median for no data', () => {
    const metrics = shapeOperationalMetrics();
    expect(metrics.ticketCounts).toEqual({
      pending: 0,
      resolved: 0,
      rejected: 0,
    });
    expect(metrics.acknowledgments).toEqual({
      acknowledged: 0,
      awaiting: 0,
      medianHours30d: null,
    });
    expect(metrics.resolutionOutcomes).toEqual([
      { label: 'Handled by the municipality', count: 0 },
      { label: 'Referred to an outside agency', count: 0 },
      { label: 'Not recorded (legacy)', count: 0 },
    ]);
    expect(metrics.hazardInformation).toEqual([
      { label: 'Classified', count: 0 },
      { label: 'No classification found', count: 0 },
      { label: 'Unavailable', count: 0 },
      { label: 'Pending/not yet checked', count: 0 },
    ]);
  });

  it('preserves exact medians and valid zero instead of reporting no data', async () => {
    for (const median of [null, 0, 1.25]) {
      const sql = jest.fn().mockResolvedValue([
        {
          pending: 4,
          acknowledged: 3,
          awaiting: 1,
          median_ack_hours: median,
        },
      ]) as unknown as Sql;
      const result = await new DashboardService(sql).getOperationalMetrics(
        'MEO',
      );
      expect(result.ticketCounts.pending).toBe(4);
      expect(result.acknowledgments).toEqual({
        acknowledged: 3,
        awaiting: 1,
        medianHours30d: median,
      });
    }
  });
});
