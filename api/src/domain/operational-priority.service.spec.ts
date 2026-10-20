import type { Sql } from 'postgres';
import { OperationalPriorityService } from './operational-priority.service';

const NOW = new Date('2026-10-01T00:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

// Tagged-template mock: first call is the SELECT, second is the UPDATE.
function makeSql(selectRows: unknown[]) {
  const sql = jest.fn().mockResolvedValueOnce(selectRows).mockResolvedValue([]);
  return sql as unknown as Sql & jest.Mock;
}

function queryText(call: unknown[]): string {
  return (call[0] as readonly string[]).join('?');
}

describe('OperationalPriorityService.recalculateActiveTickets', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns updated: 0 and writes nothing when there are no active tickets', async () => {
    const sql = makeSql([]);
    const service = new OperationalPriorityService(sql);

    await expect(service.recalculateActiveTickets()).resolves.toEqual({
      updated: 0,
    });
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it('selects only active tickets and keeps MAX severity across linked reports', async () => {
    const sql = makeSql([]);
    await new OperationalPriorityService(sql).recalculateActiveTickets();

    const select = queryText(sql.mock.calls[0]);
    expect(select).toContain(
      "t.status IN ('Reported', 'Under Review', 'In Progress')",
    );
    expect(select).toContain('MAX(CASE citizen_severity');
  });

  it('computes 0.50 severity + 0.25 age + 0.25 barangay demand and writes only priority_index', async () => {
    const sql = makeSql([
      {
        // Critical, 7 days old, busiest barangay -> 1.0 -> 100
        id: 11,
        created_at: new Date(NOW.getTime() - 7 * DAY_MS).toISOString(),
        severity_rank: 4,
        active_barangay_count: 2,
        max_active_barangay_count: 2,
      },
      {
        // Low, brand new, half the busiest barangay ->
        // 0.5*0.25 + 0 + 0.25*0.5 = 0.25 -> round(1 + 0.25*99) = 26
        id: 12,
        created_at: NOW.toISOString(),
        severity_rank: 1,
        active_barangay_count: 1,
        max_active_barangay_count: 2,
      },
    ]);
    const service = new OperationalPriorityService(sql);

    await expect(service.recalculateActiveTickets()).resolves.toEqual({
      updated: 2,
    });
    expect(sql).toHaveBeenCalledTimes(2);

    const updateCall = sql.mock.calls[1];
    const update = queryText(updateCall);
    expect(update).toContain('priority_index = u.priority_index');
    for (const forbidden of [
      'priority_score',
      'urgency_score',
      'urgency_band',
      'urgency_level',
      'elevation_factor',
      'precipitation_factor',
      'cluster_factor',
    ]) {
      expect(update).not.toContain(forbidden);
    }

    // Interpolated values: [ids, priorityIndices]
    expect(updateCall[1]).toEqual([11, 12]);
    expect(updateCall[2]).toEqual([100, 26]);
  });
});
