import { readFileSync } from 'fs';
import { join } from 'path';
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Sql } from 'postgres';
import type { AdminSession } from '../auth/session.service';
import type { Env } from '../config/env';
import {
  RAINFALL_FAILURE_COOLDOWN_MS,
  RAINFALL_FETCH_TIMEOUT_MS,
  RAINFALL_REUSE_MS,
  RainfallContextService,
  isRefreshDue,
  rainfallApplicability,
} from './rainfall-context.service';

// Manuscript revision Phase 4, step 4c. fetch is always mocked: these tests
// never call the live OpenWeatherMap service. The fake SQL answers each
// query by its text and records every call, in or out of a transaction.

const API_KEY = 'owm-test-key-0123456789';
const DT = 1_793_350_800;

const MDRRMO: AdminSession = {
  adminId: 2,
  email: 'mdrrmo@example.com',
  adminName: 'Mdrrmo Staff',
  accountType: 'PERSONNEL',
  isFocal: false,
  office: 'MDRRMO',
};
const MEO: AdminSession = { ...MDRRMO, adminId: 1, office: 'MEO' };

interface Ticket {
  id: number;
  category: string;
  status: string;
  merged_into_ticket_id: number | null;
  assigned_office: 'MEO' | 'MDRRMO';
  lat: number;
  lng: number;
}

interface CurrentRow {
  id: number;
  rainfall_mm: number | null;
  fetched_at: string;
  same_location: boolean;
}

interface Call {
  text: string;
  values: unknown[];
  inTx: boolean;
}

function flood(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 7,
    category: 'Localized Flooding',
    status: 'Reported',
    merged_into_ticket_id: null,
    assigned_office: 'MDRRMO',
    lat: 15.08,
    lng: 120.54,
    ...overrides,
  };
}

function setup(
  options: {
    ticket?: Ticket | null;
    // The ticket as the in-transaction recheck sees it, one per run
    // (default: unchanged).
    recheck?: Partial<Ticket & { same_location: boolean }>[];
    current?: CurrentRow | null;
    rows?: unknown[];
    latestFetchedAt?: string | null;
    failSql?: boolean;
    hangSql?: boolean;
    lookups?: 'enabled' | 'disabled';
  } = {},
) {
  const calls: Call[] = [];
  const recheck = [...(options.recheck ?? [])];
  let current: Ticket | null =
    options.ticket === undefined ? flood() : options.ticket;
  const ticket = () => current;
  // Another ticket for the same service (and so the same cache).
  const setTicket = (t: Ticket) => (current = t);
  const answer = (text: string): unknown => {
    if (options.failSql) throw new Error('connection refused');
    const t = ticket();
    if (text.includes('UPDATE rainfall_context SET superseded_at')) {
      return Object.assign([], { count: options.current ? 1 : 0 });
    }
    if (/UPDATE rainfall_context|INSERT INTO rainfall_context/.test(text)) {
      return [];
    }
    if (text.includes('max(fetched_at)')) {
      return [{ fetched_at: options.latestFetchedAt ?? null }];
    }
    if (text.includes('FROM rainfall_context r')) return options.rows ?? [];
    if (text.includes('FROM rainfall_context')) {
      return options.current ? [options.current] : [];
    }
    if (text.includes('FOR UPDATE')) {
      if (!t) return [];
      const next = recheck.length ? recheck.shift()! : {};
      return [
        {
          category: next.category ?? t.category,
          status: next.status ?? t.status,
          merged_into_ticket_id:
            next.merged_into_ticket_id === undefined
              ? t.merged_into_ticket_id
              : next.merged_into_ticket_id,
          same_location: next.same_location ?? true,
        },
      ];
    }
    if (text.includes('FROM tickets WHERE id')) return t ? [t] : [];
    return [];
  };
  const tag = (inTx: boolean) =>
    jest.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join('?');
      calls.push({ text, values, inTx });
      if (options.hangSql) return new Promise(() => undefined);
      try {
        return Promise.resolve(answer(text));
      } catch (err) {
        return Promise.reject(
          err instanceof Error ? err : new Error(String(err)),
        );
      }
    });
  const begin = jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn(tag(true)),
  );
  const sql = Object.assign(tag(false), { begin }) as unknown as Sql;
  const config = {
    get: (key: string) =>
      key === 'OPENWEATHERMAP_API_KEY'
        ? API_KEY
        : (options.lookups ?? 'enabled'),
  } as unknown as ConfigService<Env, true>;
  const service = new RainfallContextService(sql, config);
  const writes = () =>
    calls.filter((c) => /^\s*(UPDATE|INSERT|DELETE)/.test(c.text));
  const inserts = () => writes().filter((w) => /INSERT/.test(w.text));
  return { service, calls, writes, inserts, setTicket };
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () =>
      Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response;
}
const dry = () => jsonResponse({ dt: DT, weather: [{ main: 'Clouds' }] });
const raining = (mm: number) => jsonResponse({ dt: DT, rain: { '1h': mm } });

let fetchMock: jest.SpyInstance<Promise<Response>, Parameters<typeof fetch>>;
let warn: jest.SpyInstance;
const fetchedUrl = (call = 0) =>
  new URL(fetchMock.mock.calls[call][0] as string);
// Everything logged as a warning, one message per line.
const warned = () =>
  (warn.mock.calls as unknown[][]).map((c) => String(c[0])).join('\n');
const minutesAgo = (m: number) =>
  new Date(Date.now() - m * 60_000).toISOString();
beforeEach(() => {
  fetchMock = jest
    .spyOn(global, 'fetch')
    .mockRejectedValue(new Error('unexpected fetch'));
  warn = jest
    .spyOn(Logger.prototype, 'warn')
    .mockImplementation(() => undefined);
});
afterEach(() => {
  fetchMock.mockRestore();
  warn.mockRestore();
  jest.useRealTimers();
});

describe('RainfallContextService.fetchReading (mocked fetch)', () => {
  it('asks Current Weather at the rounded point with the configured key, once', async () => {
    fetchMock.mockResolvedValue(raining(2.5));
    await expect(
      setup().service.fetchReading('15.0800,120.5400'),
    ).resolves.toEqual({
      ok: true,
      rainfallMm: 2.5,
      observationAt: new Date(DT * 1000),
    });
    const url = fetchedUrl();
    expect(url.pathname).toBe('/data/2.5/weather');
    expect(url.searchParams.get('lat')).toBe('15.0800');
    expect(url.searchParams.get('lon')).toBe('120.5400');
    expect(url.searchParams.get('appid')).toBe(API_KEY);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('HTTP 200 with dt and no rain -> a real 0 mm', async () => {
    fetchMock.mockResolvedValue(dry());
    await expect(
      setup().service.fetchReading('15.0800,120.5400'),
    ).resolves.toMatchObject({ ok: true, rainfallMm: 0 });
  });

  it('HTTP 200 without dt is a failure, never 0 mm', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ weather: [] }));
    await expect(
      setup().service.fetchReading('15.0800,120.5400'),
    ).resolves.toEqual({
      ok: false,
      failureReason: 'Unexpected response: no observation time (dt)',
    });
  });

  it('a non-200 keeps the provider message, with the key redacted', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { cod: 401, message: `Invalid API key ${API_KEY}. See the FAQ.` },
        401,
      ),
    );
    const result = await setup().service.fetchReading('15.0800,120.5400');
    expect(result).toEqual({
      ok: false,
      failureReason: 'HTTP 401: Invalid API key [redacted]. See the FAQ.',
    });
  });

  it('a non-JSON error body -> the status alone', async () => {
    fetchMock.mockResolvedValue(jsonResponse('Bad Gateway', 502));
    await expect(
      setup().service.fetchReading('15.0800,120.5400'),
    ).resolves.toEqual({ ok: false, failureReason: 'HTTP 502' });
  });

  it('unparsable JSON on 200 -> a failure', async () => {
    fetchMock.mockResolvedValue(jsonResponse('{not json'));
    await expect(
      setup().service.fetchReading('15.0800,120.5400'),
    ).resolves.toEqual({
      ok: false,
      failureReason: 'Unparsable JSON response',
    });
  });

  it('a network error naming the request URL never carries the key', async () => {
    fetchMock.mockRejectedValue(
      new TypeError(
        `fetch failed for https://api.openweathermap.org/data/2.5/weather?lat=15.08&lon=120.54&appid=${API_KEY}`,
      ),
    );
    const result = await setup().service.fetchReading('15.0800,120.5400');
    expect(result.ok).toBe(false);
    const reason = (result as { failureReason: string }).failureReason;
    expect(reason).toMatch(/^Network error: fetch failed for/);
    expect(reason).toContain('appid=[redacted]');
    expect(reason).not.toContain(API_KEY);
  });

  it('a hang is cut off after 5 s, a single attempt', async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init!.signal!.addEventListener('abort', () =>
            reject(
              new DOMException('This operation was aborted', 'AbortError'),
            ),
          );
        }),
    );
    const result = setup().service.fetchReading('15.0800,120.5400');
    await jest.advanceTimersByTimeAsync(RAINFALL_FETCH_TIMEOUT_MS - 1);
    let settled = false;
    void result.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toEqual({
      ok: false,
      failureReason: 'Timed out after 5 s',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('RainfallContextService.refresh: writes', () => {
  it('success: supersedes the current row and inserts CURRENT in one transaction, at the ticket location', async () => {
    fetchMock.mockResolvedValue(raining(4.2));
    const t = setup();
    await expect(t.service.refresh(7, 'detail')).resolves.toEqual({
      outcome: 'recorded',
      status: 'CURRENT',
      fromCache: false,
    });
    const writes = t.writes();
    expect(writes).toHaveLength(2);
    expect(writes.every((w) => w.inTx)).toBe(true);
    expect(writes[0].text).toMatch(
      /UPDATE rainfall_context SET superseded_at = now\(\)\s+WHERE ticket_id = \? AND superseded_at IS NULL/,
    );
    expect(writes[1].text).toMatch(/INSERT INTO rainfall_context/);
    expect(writes[1].text).toMatch(/'CURRENT'/);
    const [ticketId, mm, provider, observedAt, fetchedAt, lng, lat] =
      writes[1].values;
    expect([ticketId, mm, provider, lng, lat]).toEqual([
      7,
      4.2,
      'OpenWeatherMap',
      120.54,
      15.08,
    ]);
    expect(observedAt).toEqual(new Date(DT * 1000));
    expect(fetchedAt).toBeInstanceOf(Date);
    // The ticket row is locked for the write.
    expect(
      t.calls.find((c) => c.text.includes('AS same_location') && c.inTx)?.text,
    ).toMatch(/FOR UPDATE/);
  });

  // The 0 mm bug: a valid zero must never be treated as missing.
  it('0 mm is stored as CURRENT 0, never NULL or UNAVAILABLE', async () => {
    fetchMock.mockResolvedValue(dry());
    const t = setup();
    await expect(t.service.refresh(7, 'detail')).resolves.toMatchObject({
      status: 'CURRENT',
    });
    const insert = t.inserts()[0];
    expect(insert.text).toMatch(/'CURRENT'/);
    expect(insert.values[1]).toBe(0);
  });

  it('0 mm counts as a last good value: a later failure keeps it as STALE 0', async () => {
    fetchMock.mockResolvedValue(jsonResponse('down', 503));
    const t = setup({
      current: {
        id: 31,
        rainfall_mm: 0,
        fetched_at: minutesAgo(30),
        same_location: true,
      },
    });
    await expect(t.service.refresh(7, 'detail')).resolves.toMatchObject({
      status: 'STALE',
    });
    expect(t.inserts()).toEqual([]);
    const [update] = t.writes();
    expect(update.text).toMatch(
      /UPDATE rainfall_context SET status = 'STALE', failure_reason = \?\s+WHERE id = \?/,
    );
    expect(update.values).toEqual(['HTTP 503', 31]);
  });

  it('failure with an earlier value: that row becomes STALE in place, keeping its value and times (A1)', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const t = setup({
      current: {
        id: 31,
        rainfall_mm: 6.5,
        fetched_at: minutesAgo(25),
        same_location: true,
      },
    });
    await expect(t.service.refresh(7, 'detail')).resolves.toEqual({
      outcome: 'recorded',
      status: 'STALE',
      fromCache: false,
    });
    const writes = t.writes();
    expect(writes).toHaveLength(1);
    // Only status and failure_reason change: rainfall_mm, observation_at
    // and fetched_at are kept.
    expect(writes[0].text).not.toMatch(
      /rainfall_mm|observation_at|fetched_at|superseded_at/,
    );
    expect(writes[0].values).toEqual(['Network error: fetch failed', 31]);
  });

  it('failure with no earlier value: UNAVAILABLE with no value and the reason', async () => {
    fetchMock.mockResolvedValue(jsonResponse('down', 500));
    const t = setup();
    await expect(t.service.refresh(7, 'detail')).resolves.toMatchObject({
      status: 'UNAVAILABLE',
    });
    const insert = t.inserts()[0];
    expect(insert.text).toMatch(/'UNAVAILABLE', NULL, \?, NULL,/);
    expect(insert.values).toEqual([
      7,
      'OpenWeatherMap',
      expect.any(Date),
      120.54,
      15.08,
      'HTTP 500',
    ]);
  });

  it('failure after an earlier UNAVAILABLE: supersede it and insert a new UNAVAILABLE', async () => {
    fetchMock.mockResolvedValue(jsonResponse('down', 500));
    const t = setup({
      current: {
        id: 31,
        rainfall_mm: null,
        fetched_at: minutesAgo(20),
        same_location: true,
      },
    });
    await t.service.refresh(7, 'detail');
    const writes = t.writes();
    expect(
      writes.map((w) => w.text.trim().split(/\s+/).slice(0, 3).join(' ')),
    ).toEqual(['UPDATE rainfall_context SET', 'INSERT INTO rainfall_context']);
    expect(writes[1].text).toMatch(/'UNAVAILABLE'/);
  });

  it('failure when the earlier value is for another location: UNAVAILABLE, the old row superseded', async () => {
    fetchMock.mockResolvedValue(jsonResponse('down', 500));
    const t = setup({
      current: {
        id: 31,
        rainfall_mm: 6.5,
        fetched_at: minutesAgo(1),
        same_location: false,
      },
    });
    await expect(t.service.refresh(7, 'detail')).resolves.toMatchObject({
      status: 'UNAVAILABLE',
    });
    expect(t.writes()[0].text).toMatch(/SET superseded_at = now\(\)/);
  });

  it('never deletes a row', async () => {
    fetchMock.mockResolvedValue(raining(1));
    const t = setup();
    await t.service.refresh(7, 'correction');
    expect(t.calls.some((c) => /DELETE/.test(c.text))).toBe(false);
  });

  // Rainfall never changes Operational Priority, Hazard Information or the
  // ticket itself: every write goes to rainfall_context.
  it.each([
    ['success', () => raining(3)],
    ['failure', () => jsonResponse('down', 500)],
  ])('%s writes only rainfall_context', async (_label, response) => {
    fetchMock.mockResolvedValue(response());
    const t = setup({
      current: {
        id: 31,
        rainfall_mm: 1,
        fetched_at: minutesAgo(30),
        same_location: true,
      },
    });
    await t.service.refresh(7, 'correction');
    const writes = t.writes();
    expect(writes.length).toBeGreaterThan(0);
    for (const w of writes) {
      expect(w.text).toMatch(/^\s*(UPDATE|INSERT INTO) rainfall_context\b/);
      expect(w.text).not.toMatch(
        /priority_index|hazard_information|UPDATE tickets/,
      );
    }
  });
});

describe('RainfallContextService.refresh: applicability, closed and merged-away tickets', () => {
  it.each([
    'Lahar or Volcanic Debris-Flow Threat',
    'Fallen Tree or Storm-Related Road Obstruction',
    'Pothole / Road Surface Damage',
  ])(
    '%s makes no call; current rows are superseded and nothing is inserted',
    async (category) => {
      const t = setup({
        ticket: flood({ category }),
        current: {
          id: 31,
          rainfall_mm: 2,
          fetched_at: minutesAgo(3),
          same_location: true,
        },
      });
      await expect(t.service.refresh(7, 'correction')).resolves.toEqual({
        outcome: 'not_applicable',
        superseded: 1,
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(t.writes()).toHaveLength(1);
      expect(t.inserts()).toEqual([]);
    },
  );

  it('legacy category names behave like the new ones', async () => {
    fetchMock.mockResolvedValue(raining(1));
    for (const category of ['Flooding', 'Landslide / Slope Failure']) {
      const t = setup({ ticket: flood({ category }) });
      await expect(t.service.refresh(7, 'manual')).resolves.toMatchObject({
        outcome: 'recorded',
      });
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each(['Resolved', 'Rejected'])(
    'a %s ticket is never refreshed: no call, no write (its history stays)',
    async (status) => {
      fetchMock.mockResolvedValue(raining(1));
      for (const reason of ['detail', 'correction', 'manual'] as const) {
        const t = setup({ ticket: flood({ status }) });
        await expect(t.service.refresh(7, reason)).resolves.toEqual({
          outcome: 'skipped',
          reason: 'closed',
        });
        expect(t.writes()).toEqual([]);
      }
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('a ticket closed while the provider answered is not written', async () => {
    fetchMock.mockResolvedValue(raining(1));
    const t = setup({ recheck: [{ status: 'Resolved' }] });
    await expect(t.service.refresh(7, 'detail')).resolves.toEqual({
      outcome: 'skipped',
      reason: 'closed',
    });
    expect(t.writes()).toEqual([]);
  });

  it('skips a merged-away ticket: no call, no write', async () => {
    const t = setup({ ticket: flood({ merged_into_ticket_id: 3 }) });
    await expect(t.service.refresh(7, 'correction')).resolves.toEqual({
      outcome: 'skipped',
      reason: 'merged_away',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(t.writes()).toEqual([]);
  });

  it('skips an unknown ticket', async () => {
    const t = setup({ ticket: null });
    await expect(t.service.refresh(7)).resolves.toEqual({
      outcome: 'skipped',
      reason: 'not_found',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('RAINFALL_LOOKUPS=disabled: no query, no call, no write', async () => {
    const t = setup({ lookups: 'disabled' });
    for (const reason of ['detail', 'correction', 'manual'] as const) {
      await expect(t.service.refresh(7, reason)).resolves.toEqual({
        outcome: 'skipped',
        reason: 'disabled',
      });
    }
    expect(t.calls).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never throws: a database failure is logged and reported as skipped', async () => {
    const t = setup({ failSql: true });
    await expect(t.service.refresh(7)).resolves.toEqual({
      outcome: 'skipped',
      reason: 'error',
    });
  });
});

describe('RainfallContextService.refresh: 10-minute reuse', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-30T08:00:00Z') });
  });

  it('a current row fetched exactly 10 minutes ago is reused as is: no call, no write', async () => {
    const t = setup({
      current: {
        id: 31,
        rainfall_mm: 2,
        fetched_at: new Date(Date.now() - RAINFALL_REUSE_MS).toISOString(),
        same_location: true,
      },
    });
    await expect(t.service.refresh(7, 'detail')).resolves.toEqual({
      outcome: 'reused',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(t.writes()).toEqual([]);
  });

  it('a current row of 0 mm is reused like any other value', async () => {
    const t = setup({
      current: {
        id: 31,
        rainfall_mm: 0,
        fetched_at: minutesAgo(2),
        same_location: true,
      },
    });
    await expect(t.service.refresh(7, 'detail')).resolves.toEqual({
      outcome: 'reused',
    });
  });

  it('one millisecond older is refreshed', async () => {
    fetchMock.mockResolvedValue(raining(1));
    const t = setup({
      current: {
        id: 31,
        rainfall_mm: 2,
        fetched_at: new Date(Date.now() - RAINFALL_REUSE_MS - 1).toISOString(),
        same_location: true,
      },
    });
    await expect(t.service.refresh(7, 'detail')).resolves.toMatchObject({
      outcome: 'recorded',
      status: 'CURRENT',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a fresh row for an old location is not reused', async () => {
    fetchMock.mockResolvedValue(raining(1));
    const t = setup({
      current: {
        id: 31,
        rainfall_mm: 2,
        fetched_at: minutesAgo(1),
        same_location: false,
      },
    });
    await t.service.refresh(7, 'detail');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a correction or a manual refresh never reuses the ticket row', async () => {
    fetchMock.mockResolvedValue(raining(1));
    const current = {
      id: 31,
      rainfall_mm: 2,
      fetched_at: minutesAgo(1),
      same_location: true,
    };
    await setup({ current }).service.refresh(7, 'correction');
    await setup({ current }).service.refresh(7, 'manual');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('isRefreshDue uses the same boundary', () => {
    const view = (fetched: number) => ({
      applicability: 'applicable' as const,
      current: {
        id: 1,
        status: 'CURRENT' as const,
        rainfall_mm: 0,
        source_provider: 'OpenWeatherMap',
        observation_at: null,
        fetched_at: new Date(fetched).toISOString(),
        failure_reason: null,
        superseded_at: null,
      },
    });
    expect(isRefreshDue(view(Date.now() - RAINFALL_REUSE_MS))).toBe(false);
    expect(isRefreshDue(view(Date.now() - RAINFALL_REUSE_MS - 1))).toBe(true);
    expect(isRefreshDue({ applicability: 'applicable', current: null })).toBe(
      true,
    );
    expect(
      isRefreshDue({ applicability: 'closed_historical', current: null }),
    ).toBe(false);
    expect(
      isRefreshDue({ applicability: 'not_applicable', current: null }),
    ).toBe(false);
  });
});

describe('RainfallContextService.refresh: same-location cache across tickets', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-30T08:00:00Z') });
  });

  it('a second ticket at the same rounded point reuses the reading: one call, its fetched time kept', async () => {
    fetchMock.mockResolvedValue(raining(0));
    const t = setup();
    await t.service.refresh(7, 'detail');
    jest.setSystemTime(Date.now() + 5 * 60_000);
    await expect(t.service.refresh(8, 'detail')).resolves.toEqual({
      outcome: 'recorded',
      status: 'CURRENT',
      fromCache: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [first, second] = t.inserts();
    // Same value (0 mm), observation and fetched time.
    expect(second.values[1]).toBe(0);
    expect(second.values.slice(1, 5)).toEqual(first.values.slice(1, 5));
  });

  it('points rounding to the same 4 decimals share; the next cell does not', async () => {
    fetchMock.mockResolvedValue(raining(1));
    const t = setup({ ticket: flood({ lat: 15.08001 }) });
    await t.service.refresh(7, 'detail');
    // A ticket a few metres away.
    t.setTicket(flood({ id: 8, lat: 15.08004 }));
    await t.service.refresh(8, 'detail');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // About 11 m further: the next cell.
    t.setTicket(flood({ id: 9, lat: 15.0801 }));
    await t.service.refresh(9, 'detail');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchedUrl(1).searchParams.get('lat')).toBe('15.0801');
  });

  it('expires after 10 minutes', async () => {
    fetchMock.mockResolvedValue(raining(1));
    const t = setup();
    await t.service.refresh(7, 'detail');
    jest.setSystemTime(Date.now() + RAINFALL_REUSE_MS + 1);
    await t.service.refresh(8, 'detail');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('a correction may use it; a manual refresh always asks the provider', async () => {
    fetchMock.mockResolvedValue(raining(1));
    const t = setup();
    await t.service.refresh(7, 'detail');
    await expect(t.service.refresh(8, 'correction')).resolves.toMatchObject({
      fromCache: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(t.service.refresh(9, 'manual')).resolves.toMatchObject({
      fromCache: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('failures are never cached', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse('down', 500));
    fetchMock.mockResolvedValue(raining(1));
    const t = setup();
    await t.service.refresh(7, 'detail');
    await expect(t.service.refresh(8, 'detail')).resolves.toMatchObject({
      status: 'CURRENT',
      fromCache: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('RainfallContextService.refresh: cooldown after a failure', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-30T08:00:00Z') });
  });
  const stale = () => ({
    id: 31,
    rainfall_mm: 3,
    fetched_at: minutesAgo(30),
    same_location: true,
  });

  it('opening Ticket Detail within 60 s of a failed call makes no new call', async () => {
    fetchMock.mockResolvedValue(jsonResponse('down', 503));
    const t = setup({ current: stale() });
    await t.service.refresh(7, 'detail');
    jest.setSystemTime(Date.now() + RAINFALL_FAILURE_COOLDOWN_MS - 1);
    await expect(t.service.refresh(7, 'detail')).resolves.toEqual({
      outcome: 'skipped',
      reason: 'cooldown',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    jest.setSystemTime(Date.now() + 1);
    await t.service.refresh(7, 'detail');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('the cooldown is per ticket, and a success clears it', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse('down', 503));
    fetchMock.mockResolvedValue(raining(1));
    const t = setup({ current: stale() });
    await t.service.refresh(7, 'detail');
    // Another ticket at the same point is not held back (a failure is
    // never cached, so it calls).
    t.setTicket(flood({ id: 8 }));
    await t.service.refresh(8, 'detail');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Ticket 7 still is.
    t.setTicket(flood());
    await expect(t.service.refresh(7, 'detail')).resolves.toEqual({
      outcome: 'skipped',
      reason: 'cooldown',
    });
    // A successful (manual) call clears it.
    await t.service.refresh(7, 'manual');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await expect(t.service.refresh(7, 'detail')).resolves.toEqual({
      outcome: 'recorded',
      status: 'CURRENT',
      fromCache: true,
    });
  });

  it('a correction is not held back by the cooldown', async () => {
    fetchMock.mockResolvedValue(jsonResponse('down', 503));
    const t = setup({ current: stale() });
    await t.service.refresh(7, 'detail');
    await t.service.refresh(7, 'correction');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('RainfallContextService.refresh: corrections supersede', () => {
  it('success: the previous row is superseded and kept, the new reading inserted', async () => {
    fetchMock.mockResolvedValue(raining(2));
    const t = setup({
      current: {
        id: 31,
        rainfall_mm: 5,
        fetched_at: minutesAgo(1),
        same_location: false,
      },
    });
    await t.service.refresh(7, 'correction');
    const writes = t.writes();
    expect(writes[0].text).toMatch(/SET superseded_at = now\(\)/);
    expect(writes[1].text).toMatch(/'CURRENT'/);
  });

  it('failure after a category change at the same location: the previous row is history and its value carries on as STALE', async () => {
    fetchMock.mockResolvedValue(jsonResponse('down', 503));
    const t = setup({
      ticket: flood({ category: 'Rain-Induced Slope Failure/Landslide' }),
      current: {
        id: 31,
        rainfall_mm: 0,
        fetched_at: minutesAgo(30),
        same_location: true,
      },
    });
    await expect(t.service.refresh(7, 'correction')).resolves.toMatchObject({
      status: 'STALE',
    });
    const writes = t.writes();
    expect(writes).toHaveLength(2);
    expect(writes[0].text).toMatch(/SET superseded_at = now\(\)/);
    expect(writes[1].text).toMatch(
      /INSERT INTO rainfall_context[\s\S]*SELECT ticket_id, 'STALE', rainfall_mm, source_provider, observation_at,\s+fetched_at, query_geom, \?\s+FROM rainfall_context WHERE id = \?/,
    );
    expect(writes[1].values).toEqual(['HTTP 503', 31]);
  });

  it('failure after a location change: UNAVAILABLE (the old value was for another place)', async () => {
    fetchMock.mockResolvedValue(jsonResponse('down', 503));
    const t = setup({
      current: {
        id: 31,
        rainfall_mm: 4,
        fetched_at: minutesAgo(1),
        same_location: false,
      },
    });
    await expect(t.service.refresh(7, 'correction')).resolves.toMatchObject({
      status: 'UNAVAILABLE',
    });
  });

  it('a ticket moved while the provider answered is refreshed again at its new location', async () => {
    fetchMock.mockResolvedValue(raining(1));
    const t = setup({ recheck: [{ same_location: false }] });
    await expect(t.service.refresh(7, 'detail')).resolves.toMatchObject({
      outcome: 'recorded',
      status: 'CURRENT',
    });
    expect(t.inserts()).toHaveLength(1);
  });

  it('stops re-running after three runs', async () => {
    fetchMock.mockResolvedValue(raining(1));
    const t = setup({
      recheck: [
        { same_location: false },
        { same_location: false },
        { same_location: false },
        { same_location: false },
      ],
    });
    await expect(t.service.refresh(7, 'manual')).resolves.toEqual({
      outcome: 'skipped',
      reason: 'changed',
    });
    expect(t.writes()).toEqual([]);
  });

  it('one refresh per ticket at a time; a correction during it asks for one more run', async () => {
    let release!: (r: Response) => void;
    fetchMock.mockImplementationOnce(
      () => new Promise<Response>((resolve) => (release = resolve)),
    );
    fetchMock.mockResolvedValue(raining(1));
    const t = setup();
    const first = t.service.refresh(7, 'manual');
    const detail = t.service.refresh(7, 'detail');
    await new Promise((resolve) => setImmediate(resolve));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const correction = t.service.refresh(7, 'correction');
    release(raining(2));
    await Promise.all([first, detail, correction]);
    // The first run, plus the one the correction asked for (served from the
    // same-location cache the first run filled).
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(t.inserts()).toHaveLength(2);
  });
});

describe('RainfallContextService.trigger', () => {
  it('returns at once, without waiting for a hung provider', () => {
    fetchMock.mockImplementation(() => new Promise(() => undefined));
    const t = setup();
    expect(t.service.trigger(7)).toBeUndefined();
    expect(t.service.triggerForCorrection(7)).toBeUndefined();
  });

  it('returns at once when the database hangs too', () => {
    const t = setup({ hangSql: true });
    expect(t.service.triggerForCorrection(7)).toBeUndefined();
  });

  it('triggerForCorrection refreshes with the correction rule', () => {
    const t = setup();
    const refresh = jest
      .spyOn(t.service, 'refresh')
      .mockResolvedValue({ outcome: 'skipped', reason: 'disabled' });
    t.service.triggerForCorrection(7);
    expect(refresh).toHaveBeenCalledWith(7, 'correction');
  });

  it('swallows a rejected refresh, and never logs the key', async () => {
    const t = setup();
    jest
      .spyOn(t.service, 'refresh')
      .mockRejectedValue(new Error(`boom appid=${API_KEY}`));
    expect(() => t.service.trigger(7)).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));
    const logged = warned();
    expect(logged).toContain('appid=[redacted]');
    expect(logged).not.toContain(API_KEY);
  });

  it('a failed call logs the reason without the key', async () => {
    fetchMock.mockRejectedValue(
      new TypeError(`connect ECONNREFUSED ?appid=${API_KEY}`),
    );
    await setup().service.refresh(7, 'manual');
    const logged = warned();
    expect(logged).toContain('could not be fetched');
    expect(logged).not.toContain(API_KEY);
  });
});

describe('RainfallContextService.getForTicket', () => {
  const row = (overrides: Record<string, unknown>) => ({
    id: 1,
    status: 'CURRENT',
    rainfall_mm: 0,
    source_provider: 'OpenWeatherMap',
    observation_at: '2026-10-30T07:00:00.000Z',
    fetched_at: '2026-10-30T07:05:00.000Z',
    failure_reason: null,
    superseded_at: null,
    at_current_location: true,
    ...overrides,
  });

  it('the current row at the ticket location; older rows are history, newest first', async () => {
    const t = setup({
      rows: [
        row({ id: 3 }),
        row({ id: 2, rainfall_mm: 4, superseded_at: '2026-10-30T07:04:00Z' }),
        row({
          id: 1,
          status: 'UNAVAILABLE',
          rainfall_mm: null,
          failure_reason: 'HTTP 500',
          superseded_at: '2026-10-30T06:00:00Z',
        }),
      ],
    });
    const view = await t.service.getForTicket(flood());
    expect(view.applicability).toBe('applicable');
    expect(view.valueLabel).toBe('Rainfall (last hour)');
    expect(view.current).toEqual(
      expect.objectContaining({ id: 3, status: 'CURRENT', rainfall_mm: 0 }),
    );
    expect(view.current).not.toHaveProperty('at_current_location');
    expect(view.history.map((h) => h.id)).toEqual([2, 1]);
    expect(t.calls[0].text).toMatch(/ORDER BY r\.id DESC/);
  });

  it('a current row at an old location is history, not current', async () => {
    const t = setup({ rows: [row({ id: 3, at_current_location: false })] });
    const view = await t.service.getForTicket(flood());
    expect(view.current).toBeNull();
    expect(view.history.map((h) => h.id)).toEqual([3]);
  });

  it('closed and merged-away tickets: closed_historical, with their stored rows', async () => {
    const t = setup({ rows: [row({ id: 3 })] });
    for (const ticket of [
      flood({ status: 'Resolved' }),
      flood({ status: 'Rejected' }),
      flood({ merged_into_ticket_id: 2 }),
    ]) {
      const view = await t.service.getForTicket(ticket);
      expect(view.applicability).toBe('closed_historical');
      expect(view.current?.id).toBe(3);
    }
  });

  it('other categories: not_applicable, earlier rows still listed', async () => {
    const t = setup({
      rows: [row({ id: 3, superseded_at: '2026-10-30T07:10:00Z' })],
    });
    const view = await t.service.getForTicket(
      flood({ category: 'Pothole / Road Surface Damage' }),
    );
    expect(view.applicability).toBe('not_applicable');
    expect(view.history).toHaveLength(1);
  });

  it('rainfallApplicability', () => {
    expect(rainfallApplicability(flood())).toBe('applicable');
    expect(
      rainfallApplicability(
        flood({ category: 'Flooding', status: 'In Progress' }),
      ),
    ).toBe('applicable');
    expect(rainfallApplicability(flood({ status: 'Resolved' }))).toBe(
      'closed_historical',
    );
    expect(
      rainfallApplicability(
        flood({ category: 'Lahar or Volcanic Debris-Flow Threat' }),
      ),
    ).toBe('not_applicable');
  });
});

describe('RainfallContextService.forTicketDetail', () => {
  it('starts a background refresh when due and returns without waiting for it', async () => {
    fetchMock.mockImplementation(() => new Promise(() => undefined));
    const t = setup();
    const trigger = jest.spyOn(t.service, 'trigger');
    const view = await t.service.forTicketDetail(flood());
    expect(view.current).toBeNull();
    expect(trigger).toHaveBeenCalledWith(7, 'detail');
  });

  it('does not start one when the reading is under 10 minutes old', async () => {
    const t = setup({
      rows: [
        {
          id: 3,
          status: 'CURRENT',
          rainfall_mm: 0,
          source_provider: 'OpenWeatherMap',
          observation_at: minutesAgo(9),
          fetched_at: minutesAgo(2),
          failure_reason: null,
          superseded_at: null,
          at_current_location: true,
        },
      ],
    });
    const trigger = jest.spyOn(t.service, 'trigger');
    await t.service.forTicketDetail(flood());
    expect(trigger).not.toHaveBeenCalled();
  });

  it.each([
    flood({ status: 'Resolved' }),
    flood({ status: 'Rejected' }),
    flood({ merged_into_ticket_id: 3 }),
    flood({ category: 'Pothole / Road Surface Damage' }),
  ])('does not start one for %j', async (ticket) => {
    const t = setup();
    const trigger = jest.spyOn(t.service, 'trigger');
    await t.service.forTicketDetail(ticket);
    expect(trigger).not.toHaveBeenCalled();
  });
});

describe('RainfallContextService.manualRefresh', () => {
  it('calls the provider and returns the new state', async () => {
    fetchMock.mockResolvedValue(raining(1));
    const t = setup();
    const view = await t.service.manualRefresh(7, MDRRMO);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(view.applicability).toBe('applicable');
    expect(t.inserts()).toHaveLength(1);
  });

  it('429 within 60 s of the last fetch, with a clear message, and no call', async () => {
    const t = setup({
      latestFetchedAt: new Date(Date.now() - 20_000).toISOString(),
    });
    const err = await t.service
      .manualRefresh(7, MDRRMO)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(429);
    expect((err as HttpException).message).toMatch(
      /^Rainfall for Ticket #7 was checked less than a minute ago\. Try again in \d+ s\.$/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('429 on a second Refresh straight after the first, even when the call failed', async () => {
    fetchMock.mockResolvedValue(jsonResponse('down', 500));
    const t = setup();
    await t.service.manualRefresh(7, MDRRMO);
    await expect(t.service.manualRefresh(7, MDRRMO)).rejects.toMatchObject({
      status: 429,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('allowed again once the last fetch is over 60 s old', async () => {
    fetchMock.mockResolvedValue(raining(1));
    const t = setup({
      latestFetchedAt: new Date(Date.now() - 61_000).toISOString(),
    });
    await expect(t.service.manualRefresh(7, MDRRMO)).resolves.toBeDefined();
  });

  it("another office's ticket: 403, like Ticket Detail", async () => {
    const t = setup();
    await expect(t.service.manualRefresh(7, MEO)).rejects.toThrow(
      ForbiddenException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('unknown ticket: 404', async () => {
    const t = setup({ ticket: null });
    await expect(t.service.manualRefresh(7, MDRRMO)).rejects.toThrow(
      NotFoundException,
    );
  });

  it.each([
    [
      { merged_into_ticket_id: 3 },
      'Ticket #7 was merged into Ticket #3 and is read-only.',
    ],
    [
      { status: 'Resolved' },
      'Ticket #7 is Resolved; a closed ticket keeps its rainfall context.',
    ],
    [
      { status: 'Rejected' },
      'Ticket #7 is Rejected; a closed ticket keeps its rainfall context.',
    ],
    [
      { category: 'Lahar or Volcanic Debris-Flow Threat' },
      'Rainfall context does not apply to Lahar or Volcanic Debris-Flow Threat.',
    ],
  ])('409 for %j', async (overrides, message) => {
    const t = setup({ ticket: flood(overrides) });
    await expect(t.service.manualRefresh(7, MDRRMO)).rejects.toThrow(
      new ConflictException(message),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('RAINFALL_LOOKUPS=disabled: returns the stored state, writes nothing', async () => {
    const t = setup({ lookups: 'disabled' });
    await expect(t.service.manualRefresh(7, MDRRMO)).resolves.toMatchObject({
      applicability: 'applicable',
    });
    expect(t.writes()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// Rainfall is advisory: neither the Operational Priority formula nor the
// DENR-MGB lookup reads it, and the rainfall service never touches either.
describe('rainfall context stays out of Operational Priority and Hazard Information', () => {
  const read = (...p: string[]) =>
    readFileSync(join(__dirname, '..', ...p), 'utf8');

  it.each([
    ['domain', 'operational-priority.service.ts'],
    ['common', 'utils', 'scoring.ts'],
    ['common', 'utils', 'severity.ts'],
    ['domain', 'hazard-information.service.ts'],
    ['common', 'utils', 'hazard-information.ts'],
  ])('%s/%s never reads rainfall', (...p) => {
    expect(read(...p)).not.toMatch(/rainfall/i);
  });

  it('the rainfall service never writes priority_index, hazard_information or tickets', () => {
    // Code only: the service's comments name them to say it doesn't.
    const source = read('domain', 'rainfall-context.service.ts').replace(
      /\/\/.*$/gm,
      '',
    );
    expect(source).not.toMatch(/priority_index|hazard_information/);
    expect(source).not.toMatch(/UPDATE tickets|INSERT INTO tickets/);
  });
});
