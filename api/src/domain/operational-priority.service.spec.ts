import type { Sql } from 'postgres';
import type { TransactionSql } from 'postgres';
import {
  OperationalPriorityService,
  priorityIndexFor,
} from './operational-priority.service';

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

  it('selects only active, not merged-away tickets with every linked report severity (no MAX)', async () => {
    const sql = makeSql([]);
    await new OperationalPriorityService(sql).recalculateActiveTickets();

    const select = queryText(sql.mock.calls[0]);
    expect(select).toContain(
      "t.status IN ('Reported', 'Under Review', 'In Progress')",
    );
    expect(select).toContain('AND t.merged_into_ticket_id IS NULL');
    expect(select).toContain(
      'array_agg(citizen_severity ORDER BY created_at, id) AS member_severities',
    );
    expect(select).not.toMatch(/MAX\(CASE|severity_rank/);
    // Every active ticket: the id filter is NULL.
    expect(sql.mock.calls[0].slice(1)).toEqual([null, null, null, null]);
  });

  it('computes 0.50 severity + 0.25 age + 0.25 barangay demand and writes only priority_index', async () => {
    const sql = makeSql([
      {
        // Critical, 7 days old, busiest barangay -> 1.0 -> 100
        id: 11,
        created_at: new Date(NOW.getTime() - 7 * DAY_MS).toISOString(),
        member_severities: ['Critical'],
        active_barangay_count: 2,
        max_active_barangay_count: 2,
      },
      {
        // Low, brand new, half the busiest barangay ->
        // 0.5*0.25 + 0 + 0.25*0.5 = 0.25 -> round(1 + 0.25*99) = 26
        id: 12,
        created_at: NOW.toISOString(),
        member_severities: ['Low'],
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

  // Manuscript revision Phase 4, step 4a: the median of the members, as an
  // exact factor.
  it('uses the median Severity Factor of the member reports, not the highest', async () => {
    const sql = makeSql([
      {
        // Low + High + Critical -> median 0.75, brand new, no demand share:
        // 0.5 * 0.75 = 0.375 -> round(1 + 0.375 * 99) = 38 (MAX would be 51)
        id: 21,
        created_at: NOW.toISOString(),
        member_severities: ['Critical', 'Low', 'High'],
        active_barangay_count: 0,
        max_active_barangay_count: 0,
      },
      {
        // Medium + High -> median 0.625 (between labels), used exactly:
        // 0.5 * 0.625 = 0.3125 -> 32 (the High label alone would give 38)
        id: 22,
        created_at: NOW.toISOString(),
        member_severities: ['Medium', 'High'],
        active_barangay_count: 0,
        max_active_barangay_count: 0,
      },
    ]);
    await new OperationalPriorityService(sql).recalculateActiveTickets();
    expect(sql.mock.calls[1][2]).toEqual([38, 32]);
  });
});

describe('OperationalPriorityService.recalculateTickets (inside a transaction)', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('reads and writes only the given tickets through the transaction', async () => {
    const pg = makeSql([]);
    const tx = makeSql([
      {
        id: 5,
        created_at: NOW.toISOString(),
        priority_index: 51,
        member_severities: ['Medium', 'Critical'],
        active_barangay_count: 0,
        max_active_barangay_count: 0,
      },
    ]);
    const service = new OperationalPriorityService(pg);

    await expect(
      service.recalculateTickets(tx as unknown as TransactionSql, [5, 9]),
    ).resolves.toEqual({ updated: 1 });
    expect(pg).not.toHaveBeenCalled();
    expect(tx).toHaveBeenCalledTimes(2);
    // The id filter is applied to both the reports and the tickets.
    expect(tx.mock.calls[0].slice(1)).toEqual([
      [5, 9],
      [5, 9],
      [5, 9],
      [5, 9],
    ]);
    // Medium + Critical -> 0.75 -> 38
    expect(tx.mock.calls[1][1]).toEqual([5]);
    expect(tx.mock.calls[1][2]).toEqual([38]);
  });

  it('does nothing for an empty list', async () => {
    const tx = makeSql([]);
    await expect(
      new OperationalPriorityService(makeSql([])).recalculateTickets(
        tx as unknown as TransactionSql,
        [],
      ),
    ).resolves.toEqual({ updated: 0 });
    expect(tx).not.toHaveBeenCalled();
  });
});

describe('priorityIndexFor', () => {
  it('gives a one-report ticket the priority of its own severity', () => {
    const base = {
      id: 1,
      created_at: NOW.toISOString(),
      priority_index: null,
      active_barangay_count: 0,
      max_active_barangay_count: 0,
    };
    // 0.5 * factor -> round(1 + x * 99)
    expect(priorityIndexFor({ ...base, member_severities: ['Low'] }, NOW)).toBe(
      13,
    );
    expect(
      priorityIndexFor({ ...base, member_severities: ['Critical'] }, NOW),
    ).toBe(51);
  });
});
