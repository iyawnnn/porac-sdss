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
  HAZARD_AUTO_RETRY_AFTER_MS,
  HAZARD_LOOKUP_TIMEOUT_MS,
  HazardInformationService,
  isAutoRetryDue,
} from './hazard-information.service';

// Manuscript revision Phase 4, step 4b. fetch is always mocked: these tests
// never call the live DENR-MGB service. The fake SQL answers each query by
// its text and records every call, in or out of a transaction.

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
    // Answers for the in-transaction recheck, one per run (default: same).
    sameLocation?: boolean[];
    hazardRows?: unknown[];
    latestLookedUpAt?: string | null;
    failSql?: boolean;
    lookups?: 'enabled' | 'disabled';
  } = {},
) {
  const calls: Call[] = [];
  const sameLocation = [...(options.sameLocation ?? [])];
  const ticket = () =>
    options.ticket === undefined ? flood() : options.ticket;
  const answer = (text: string): unknown => {
    if (options.failSql) throw new Error('connection refused');
    const t = ticket();
    if (text.includes('UPDATE hazard_information')) {
      return Object.assign([], { count: 1 });
    }
    if (text.includes('INSERT INTO hazard_information')) return [];
    if (text.includes('max(looked_up_at)')) {
      return [{ looked_up_at: options.latestLookedUpAt ?? null }];
    }
    if (text.includes('FROM hazard_information h')) {
      return options.hazardRows ?? [];
    }
    if (text.includes('AS same_location')) {
      return t
        ? [
            {
              category: t.category,
              merged_into_ticket_id: t.merged_into_ticket_id,
              same_location: sameLocation.length ? sameLocation.shift() : true,
            },
          ]
        : [];
    }
    if (text.includes('FROM tickets WHERE id')) return t ? [t] : [];
    return [];
  };
  const tag = (inTx: boolean) =>
    jest.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join('?');
      calls.push({ text, values, inTx });
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
    get: () => options.lookups ?? 'enabled',
  } as unknown as ConfigService<Env, true>;
  const service = new HazardInformationService(sql, config);
  const writes = () =>
    calls.filter((c) => /^\s*(UPDATE|INSERT|DELETE)/.test(c.text));
  return { service, calls, writes };
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () =>
      Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response;
}

let fetchMock: jest.SpyInstance<Promise<Response>, Parameters<typeof fetch>>;
let warn: jest.SpyInstance;
// The URL of a mocked fetch call (the service always passes a string).
const fetchedUrl = (call = 0) => fetchMock.mock.calls[call][0] as string;
beforeEach(() => {
  fetchMock = jest
    .spyOn(global, 'fetch')
    .mockRejectedValue(new Error('unexpected fetch'));
  // Failures are logged as warnings; keep the test output quiet.
  warn = jest
    .spyOn(Logger.prototype, 'warn')
    .mockImplementation(() => undefined);
});
afterEach(() => {
  fetchMock.mockRestore();
  warn.mockRestore();
  jest.useRealTimers();
});

describe('HazardInformationService.queryLayer (mocked fetch)', () => {
  it('flood: features present -> CLASSIFIED with the FloodSusc code and wording', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ features: [{ attributes: { FloodSusc: 'VHF' } }] }),
    );
    await expect(
      setup().service.queryLayer('FLOOD', 15.08, 120.54),
    ).resolves.toEqual({
      lookupStatus: 'CLASSIFIED',
      susceptibilityCode: 'VHF',
      susceptibilityLabel: 'Very High Susceptibility to Flooding',
      failureReason: null,
    });
    const url = fetchedUrl();
    expect(url).toContain('GDI_Detailed_Flood_Susceptibility_Public');
    expect(url).toContain('outFields=FloodSusc');
    expect(url).toContain('geometry=120.54%2C15.08');
  });

  it('landslide: reads LndslideSusc from the landslide layer', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ features: [{ attributes: { LndslideSusc: 'HL' } }] }),
    );
    await expect(
      setup().service.queryLayer('RAIN_INDUCED_LANDSLIDE', 15.1, 120.4),
    ).resolves.toMatchObject({
      lookupStatus: 'CLASSIFIED',
      susceptibilityCode: 'HL',
      susceptibilityLabel: 'High Susceptibility to Landslide',
    });
    const url = fetchedUrl();
    expect(url).toContain(
      'GDI_Detailed_Rain_induced_Landslide_Susceptibility_Public',
    );
    expect(url).toContain('outFields=LndslideSusc');
  });

  it('empty features -> NO_CLASSIFICATION', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ features: [] }));
    await expect(
      setup().service.queryLayer('FLOOD', 15.08, 120.54),
    ).resolves.toMatchObject({
      lookupStatus: 'NO_CLASSIFICATION',
      susceptibilityCode: null,
      susceptibilityLabel: null,
    });
  });

  it.each([
    ['HTTP 500', () => jsonResponse('Server Error', 500), 'HTTP 500'],
    [
      'bad JSON',
      () => jsonResponse('<html>busy</html>'),
      'Unparsable JSON response',
    ],
    [
      'an ArcGIS error object with HTTP 200',
      () =>
        jsonResponse({
          error: { code: 500, message: 'Error performing query operation' },
        }),
      'ArcGIS error 500: Error performing query operation',
    ],
  ])(
    '%s -> TEMPORARILY_UNAVAILABLE with a reason',
    async (_name, response, reason) => {
      fetchMock.mockResolvedValue(response());
      await expect(
        setup().service.queryLayer('FLOOD', 15.08, 120.54),
      ).resolves.toEqual({
        lookupStatus: 'TEMPORARILY_UNAVAILABLE',
        susceptibilityCode: null,
        susceptibilityLabel: null,
        failureReason: reason,
      });
    },
  );

  it('a network error -> TEMPORARILY_UNAVAILABLE', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    await expect(
      setup().service.queryLayer('FLOOD', 15.08, 120.54),
    ).resolves.toMatchObject({
      lookupStatus: 'TEMPORARILY_UNAVAILABLE',
      failureReason: 'Network error: fetch failed',
    });
  });

  it('a hang is cut off after 8 s -> TEMPORARILY_UNAVAILABLE, a single attempt', async () => {
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
    const result = setup().service.queryLayer('FLOOD', 15.08, 120.54);
    await jest.advanceTimersByTimeAsync(HAZARD_LOOKUP_TIMEOUT_MS - 1);
    let settled = false;
    void result.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toMatchObject({
      lookupStatus: 'TEMPORARILY_UNAVAILABLE',
      failureReason: 'Timed out after 8 s',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('HazardInformationService.lookup', () => {
  it('supersedes the current row and inserts the new one in one transaction, at the ticket location', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ features: [{ attributes: { FloodSusc: 'MF' } }] }),
    );
    const t = setup();
    await expect(t.service.lookup(7)).resolves.toEqual({
      outcome: 'recorded',
      contextType: 'FLOOD',
      lookupStatus: 'CLASSIFIED',
    });
    const writes = t.writes();
    expect(writes).toHaveLength(2);
    expect(writes.every((w) => w.inTx)).toBe(true);
    expect(writes[0].text).toMatch(
      /UPDATE hazard_information SET superseded_at = now\(\)\s+WHERE ticket_id = \? AND superseded_at IS NULL/,
    );
    expect(writes[0].values).toEqual([7]);
    expect(writes[1].text).toMatch(/INSERT INTO hazard_information/);
    expect(writes[1].values).toEqual([
      7,
      'FLOOD',
      'CLASSIFIED',
      'MF',
      'Moderate Susceptibility to Flooding',
      120.54,
      15.08,
      null,
    ]);
    // The ticket row is locked for the write.
    expect(
      t.calls.find((c) => c.text.includes('AS same_location'))?.text,
    ).toMatch(/FOR UPDATE/);
  });

  it('records a failure as TEMPORARILY_UNAVAILABLE with its reason', async () => {
    fetchMock.mockResolvedValue(jsonResponse('down', 503));
    const t = setup();
    await expect(t.service.lookup(7)).resolves.toMatchObject({
      outcome: 'recorded',
      lookupStatus: 'TEMPORARILY_UNAVAILABLE',
    });
    expect(t.writes()[1].values.slice(2, 5)).toEqual([
      'TEMPORARILY_UNAVAILABLE',
      null,
      null,
    ]);
    expect(t.writes()[1].values[7]).toBe('HTTP 503');
  });

  it('landslide tickets use the landslide layer', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ features: [{ attributes: { LndslideSusc: 'LL' } }] }),
    );
    const t = setup({
      ticket: flood({ category: 'Rain-Induced Slope Failure/Landslide' }),
    });
    await t.service.lookup(7);
    expect(fetchedUrl()).toContain('LndslideSusc');
    expect(t.writes()[1].values.slice(1, 5)).toEqual([
      'RAIN_INDUCED_LANDSLIDE',
      'CLASSIFIED',
      'LL',
      'Low Susceptibility to Landslide',
    ]);
  });

  it.each([
    'Lahar or Volcanic Debris-Flow Threat',
    'Pothole / Road Surface Damage',
    'Streetlight Out',
  ])(
    '%s makes no call; current rows are superseded and nothing is inserted (history stays)',
    async (category) => {
      const t = setup({ ticket: flood({ category }) });
      await expect(t.service.lookup(7)).resolves.toEqual({
        outcome: 'not_applicable',
        superseded: 1,
      });
      expect(fetchMock).not.toHaveBeenCalled();
      const writes = t.writes();
      expect(writes).toHaveLength(1);
      expect(writes[0].text).toMatch(
        /UPDATE hazard_information SET superseded_at/,
      );
      expect(t.calls.some((c) => /DELETE/.test(c.text))).toBe(false);
    },
  );

  it('skips a merged-away ticket: no call, no write', async () => {
    const t = setup({ ticket: flood({ merged_into_ticket_id: 3 }) });
    await expect(t.service.lookup(7)).resolves.toEqual({
      outcome: 'skipped',
      reason: 'merged_away',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(t.writes()).toEqual([]);
  });

  it('skips an unknown ticket', async () => {
    const t = setup({ ticket: null });
    await expect(t.service.lookup(7)).resolves.toEqual({
      outcome: 'skipped',
      reason: 'not_found',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('HAZARD_INFORMATION_LOOKUPS=disabled: no query, no call, no write', async () => {
    const t = setup({ lookups: 'disabled' });
    await expect(t.service.lookup(7)).resolves.toEqual({
      outcome: 'skipped',
      reason: 'disabled',
    });
    expect(t.calls).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never throws: a database failure is logged and reported as skipped', async () => {
    const t = setup({ failSql: true });
    await expect(t.service.lookup(7)).resolves.toEqual({
      outcome: 'skipped',
      reason: 'error',
    });
  });

  it('a ticket moved while the source answered is looked up again at its new location', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ features: [] }));
    const t = setup({ sameLocation: [false, true] });
    await expect(t.service.lookup(7)).resolves.toMatchObject({
      outcome: 'recorded',
      lookupStatus: 'NO_CLASSIFICATION',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(t.writes().filter((w) => /INSERT/.test(w.text))).toHaveLength(1);
  });

  it('stops re-running after three runs', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ features: [] }));
    const t = setup({ sameLocation: [false, false, false, false] });
    await expect(t.service.lookup(7)).resolves.toEqual({
      outcome: 'skipped',
      reason: 'changed',
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(t.writes()).toEqual([]);
  });

  it('runs one lookup per ticket at a time; a correction during it asks for one more run', async () => {
    let release!: (r: Response) => void;
    fetchMock.mockImplementationOnce(
      () => new Promise<Response>((resolve) => (release = resolve)),
    );
    fetchMock.mockResolvedValue(jsonResponse({ features: [] }));
    const t = setup();
    const first = t.service.lookup(7);
    const autoRetry = t.service.lookup(7, { rerunIfInFlight: false });
    await new Promise((resolve) => setImmediate(resolve));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const correction = t.service.lookup(7);
    release(jsonResponse({ features: [] }));
    await Promise.all([first, autoRetry, correction]);
    // The first run, plus the one the correction asked for.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('HazardInformationService.trigger', () => {
  it('returns at once, without waiting for a hung source', () => {
    fetchMock.mockImplementation(() => new Promise(() => undefined));
    const t = setup();
    expect(t.service.trigger(7)).toBeUndefined();
    expect(
      t.service.triggerForNewTicket(7, 'Localized Flooding'),
    ).toBeUndefined();
  });

  it('only applicable categories are looked up for a new ticket', () => {
    const t = setup();
    const lookup = jest
      .spyOn(t.service, 'lookup')
      .mockResolvedValue({ outcome: 'skipped', reason: 'disabled' });
    t.service.triggerForNewTicket(1, 'Pothole / Road Surface Damage');
    t.service.triggerForNewTicket(2, 'Lahar or Volcanic Debris-Flow Threat');
    t.service.triggerForNewTicket(3, 'Localized Flooding');
    t.service.triggerForNewTicket(4, 'Rain-Induced Slope Failure/Landslide');
    expect(lookup.mock.calls.map((c) => c[0])).toEqual([3, 4]);
  });

  it('swallows a rejected lookup', async () => {
    const t = setup();
    jest.spyOn(t.service, 'lookup').mockRejectedValue(new Error('boom'));
    expect(() => t.service.trigger(7)).not.toThrow();
    await Promise.resolve();
  });
});

describe('HazardInformationService.getForTicket', () => {
  const row = (overrides: Record<string, unknown>) => ({
    id: 1,
    hazard_context_type: 'FLOOD',
    lookup_status: 'NO_CLASSIFICATION',
    susceptibility_code: null,
    susceptibility_label: null,
    failure_reason: null,
    looked_up_at: '2026-10-29T10:00:00.000Z',
    superseded_at: null,
    at_current_location: true,
    ...overrides,
  });

  it('the current row for the ticket category and location; older rows are history, newest first', async () => {
    const t = setup({
      hazardRows: [
        row({
          id: 3,
          lookup_status: 'CLASSIFIED',
          susceptibility_code: 'MF',
          susceptibility_label: 'Moderate Susceptibility to Flooding',
        }),
        row({
          id: 2,
          superseded_at: '2026-10-29T10:00:00.000Z',
          looked_up_at: '2026-10-28T10:00:00.000Z',
        }),
      ],
    });
    const view = await t.service.getForTicket(flood());
    expect(view).toMatchObject({
      applicability: 'applicable',
      contextType: 'FLOOD',
      layerName: 'Flood',
      sourceName: 'DENR-MGB Detailed Flood Susceptibility',
      current: {
        id: 3,
        lookup_status: 'CLASSIFIED',
        susceptibility_code: 'MF',
      },
      history: [{ id: 2, superseded_at: '2026-10-29T10:00:00.000Z' }],
    });
    expect(view.current).not.toHaveProperty('at_current_location');
  });

  it('a current row at an old location or for another context type is history, not current', async () => {
    const t = setup({
      hazardRows: [
        row({ id: 5, at_current_location: false }),
        row({ id: 4, hazard_context_type: 'RAIN_INDUCED_LANDSLIDE' }),
      ],
    });
    const view = await t.service.getForTicket(flood());
    expect(view.current).toBeNull();
    expect(view.history.map((h) => h.id)).toEqual([5, 4]);
  });

  it('Lahar and other categories: their applicability, no layer, history kept', async () => {
    const t = setup({
      hazardRows: [row({ superseded_at: '2026-10-29T11:00:00.000Z' })],
    });
    const lahar = await t.service.getForTicket(
      flood({ category: 'Lahar or Volcanic Debris-Flow Threat' }),
    );
    expect(lahar).toMatchObject({
      applicability: 'no_automated_classification',
      contextType: null,
      layerName: null,
      current: null,
    });
    expect(lahar.history).toHaveLength(1);
    const other = await t.service.getForTicket(
      flood({ category: 'Uneven Sidewalk' }),
    );
    expect(other.applicability).toBe('not_applicable');
  });
});

describe('isAutoRetryDue (opening Ticket Detail)', () => {
  const NOW = new Date('2026-10-29T12:00:00.000Z');
  const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
  const current = (lookup_status: string, lookedUpMsAgo: number) => ({
    id: 1,
    hazard_context_type: 'FLOOD' as const,
    lookup_status: lookup_status as 'TEMPORARILY_UNAVAILABLE',
    susceptibility_code: null,
    susceptibility_label: null,
    failure_reason: 'HTTP 500',
    looked_up_at: ago(lookedUpMsAgo),
    superseded_at: null,
  });
  const active = { status: 'Reported', merged_into_ticket_id: null };

  it('no current row (not yet checked) on an active applicable ticket: due', () => {
    expect(
      isAutoRetryDue(
        active,
        { applicability: 'applicable', current: null },
        NOW,
      ),
    ).toBe(true);
  });

  it('TEMPORARILY_UNAVAILABLE older than 10 minutes: due; 10 minutes or newer: not', () => {
    const view = (ms: number) => ({
      applicability: 'applicable' as const,
      current: current('TEMPORARILY_UNAVAILABLE', ms),
    });
    expect(
      isAutoRetryDue(active, view(HAZARD_AUTO_RETRY_AFTER_MS + 1000), NOW),
    ).toBe(true);
    expect(isAutoRetryDue(active, view(HAZARD_AUTO_RETRY_AFTER_MS), NOW)).toBe(
      false,
    );
    expect(isAutoRetryDue(active, view(9 * 60_000), NOW)).toBe(false);
  });

  it('a CLASSIFIED or NO_CLASSIFICATION result is never retried', () => {
    for (const status of ['CLASSIFIED', 'NO_CLASSIFICATION']) {
      expect(
        isAutoRetryDue(
          active,
          {
            applicability: 'applicable',
            current: current(status, 24 * 60 * 60_000),
          },
          NOW,
        ),
      ).toBe(false);
    }
  });

  it('closed (Resolved / Rejected) and merged-away tickets keep what they have', () => {
    const view = { applicability: 'applicable' as const, current: null };
    expect(
      isAutoRetryDue(
        { status: 'Resolved', merged_into_ticket_id: null },
        view,
        NOW,
      ),
    ).toBe(false);
    expect(
      isAutoRetryDue(
        { status: 'Rejected', merged_into_ticket_id: null },
        view,
        NOW,
      ),
    ).toBe(false);
    expect(
      isAutoRetryDue(
        { status: 'Reported', merged_into_ticket_id: 3 },
        view,
        NOW,
      ),
    ).toBe(false);
    expect(
      isAutoRetryDue(
        { status: 'In Progress', merged_into_ticket_id: null },
        view,
        NOW,
      ),
    ).toBe(true);
  });

  it('Lahar and other categories never', () => {
    expect(
      isAutoRetryDue(
        active,
        { applicability: 'no_automated_classification', current: null },
        NOW,
      ),
    ).toBe(false);
    expect(
      isAutoRetryDue(
        active,
        { applicability: 'not_applicable', current: null },
        NOW,
      ),
    ).toBe(false);
  });
});

describe('HazardInformationService.forTicketDetail', () => {
  it('starts a background lookup when due and returns without waiting for it', async () => {
    fetchMock.mockImplementation(() => new Promise(() => undefined));
    const t = setup();
    const trigger = jest.spyOn(t.service, 'trigger');
    const view = await t.service.forTicketDetail(flood());
    expect(view.current).toBeNull();
    expect(trigger).toHaveBeenCalledWith(7, { rerunIfInFlight: false });
  });

  it('does not start one for a closed ticket', async () => {
    const t = setup();
    const trigger = jest.spyOn(t.service, 'trigger');
    await t.service.forTicketDetail(flood({ status: 'Resolved' }));
    expect(trigger).not.toHaveBeenCalled();
  });
});

describe('HazardInformationService.retry', () => {
  it('runs the lookup and returns the new state', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ features: [] }));
    const t = setup();
    const view = await t.service.retry(7, MDRRMO);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(view.applicability).toBe('applicable');
    expect(t.writes().filter((w) => /INSERT/.test(w.text))).toHaveLength(1);
  });

  it('429 within 60 s of the last lookup, with a clear message, and no call', async () => {
    const t = setup({
      latestLookedUpAt: new Date(Date.now() - 20_000).toISOString(),
    });
    const err = await t.service.retry(7, MDRRMO).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(429);
    expect((err as HttpException).message).toMatch(
      /^Hazard Information for Ticket #7 was checked less than a minute ago\. Try again in \d+ s\.$/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('429 on a second Retry straight after the first, even before a row is written', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ features: [] }));
    const t = setup();
    await t.service.retry(7, MDRRMO);
    await expect(t.service.retry(7, MDRRMO)).rejects.toMatchObject({
      status: 429,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('allowed again once the last lookup is over 60 s old', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ features: [] }));
    const t = setup({
      latestLookedUpAt: new Date(Date.now() - 61_000).toISOString(),
    });
    await expect(t.service.retry(7, MDRRMO)).resolves.toBeDefined();
  });

  it("another office's ticket: 403, like Ticket Detail", async () => {
    const t = setup();
    await expect(t.service.retry(7, MEO)).rejects.toThrow(ForbiddenException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('unknown ticket: 404', async () => {
    const t = setup({ ticket: null });
    await expect(t.service.retry(7, MDRRMO)).rejects.toThrow(NotFoundException);
  });

  it.each([
    [
      { merged_into_ticket_id: 3 },
      'Ticket #7 was merged into Ticket #3 and is read-only.',
    ],
    [
      { status: 'Resolved' },
      'Ticket #7 is Resolved; a closed ticket keeps its Hazard Information.',
    ],
    [
      { status: 'Rejected' },
      'Ticket #7 is Rejected; a closed ticket keeps its Hazard Information.',
    ],
    [
      { category: 'Lahar or Volcanic Debris-Flow Threat' },
      'Hazard Information has no lookup for Lahar or Volcanic Debris-Flow Threat.',
    ],
  ])('409 for %j', async (overrides, message) => {
    const t = setup({ ticket: flood(overrides) });
    await expect(t.service.retry(7, MDRRMO)).rejects.toThrow(
      new ConflictException(message),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
