import { readFileSync } from 'fs';
import { join } from 'path';
import { HttpException, NotFoundException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Sql } from 'postgres';
import {
  ReportsController,
  REFERENCE_NOT_FOUND_MESSAGE,
} from './reports.controller';
import { ReportsService } from './reports.service';
import {
  REFERENCE_LOOKUP_LIMIT,
  REFERENCE_LOOKUP_WINDOW_MS,
  ReferenceLookupRateLimitGuard,
  SlidingWindowCounter,
} from '../common/guards/reference-lookup-rate-limit.guard';
import type { CitizenSession } from '../auth/session.service';
import type { BarangayService } from '../domain/barangay.service';
import type { MediaService } from '../domain/media.service';
import type { RateLimitService } from '../domain/ratelimit.service';
import type { OperationalPriorityService } from '../domain/operational-priority.service';
import type { HazardInformationService } from '../domain/hazard-information.service';
import type { NotificationsService } from '../notifications/notifications.service';

// Owner-only tracking-reference lookup (manuscript revision Phase 6, step
// 6b): GET /reports/mine/by-reference/:ref.

// A stand-in database: reports by reference and owner. The service's one
// query is answered from it, so the ownership rule is exercised for real.
const REPORTS = [
  { id: 41, citizenId: 1, ref: 'PRC-2026-000041' },
  { id: 42, citizenId: 2, ref: 'PRC-2026-000042' },
];

function makeController() {
  const queries: { text: string; values: unknown[] }[] = [];
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    if (values.some((v) => v instanceof Date)) {
      throw new Error('A JS Date was passed to raw SQL');
    }
    const text = strings.join('?');
    queries.push({ text, values });
    // Answers like the database would: filtered by owner only when the
    // query itself is owner-scoped.
    const [ref, citizenId] = values;
    const ownerScoped = /citizen_id = \?/.test(text);
    const rows = REPORTS.filter(
      (r) => r.ref === ref && (!ownerScoped || r.citizenId === citizenId),
    ).map((r) => ({ id: r.id, citizen_id: r.citizenId }));
    return {
      then(resolve: (v: unknown) => void) {
        void Promise.resolve(rows).then(resolve);
      },
    };
  }) as unknown as Sql;
  const service = new ReportsService(
    sql,
    {} as BarangayService,
    {} as MediaService,
    {} as RateLimitService,
    {} as OperationalPriorityService,
    {} as NotificationsService,
    {} as HazardInformationService,
  );
  return { controller: new ReportsController(service), queries };
}

const citizen1 = { citizenId: 1 } as CitizenSession;

async function failureOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (err) {
    const e = err as HttpException;
    return { status: e.getStatus(), body: e.getResponse() };
  }
  throw new Error('expected the lookup to fail');
}

describe('GET /reports/mine/by-reference/:ref', () => {
  it("returns { id } only for the citizen's own reference", async () => {
    const { controller } = makeController();
    await expect(
      controller.mineByReference(citizen1, 'PRC-2026-000041'),
    ).resolves.toEqual({ id: 41 });
    // Lower case and surrounding spaces are accepted.
    await expect(
      controller.mineByReference(citizen1, ' prc-2026-000041 '),
    ).resolves.toEqual({ id: 41 });
  });

  it("another citizen's reference and a missing one get the identical 404", async () => {
    const { controller } = makeController();
    const notMine = await failureOf(
      controller.mineByReference(citizen1, 'PRC-2026-000042'),
    );
    const missing = await failureOf(
      controller.mineByReference(citizen1, 'PRC-2026-999999'),
    );
    expect(notMine.status).toBe(404);
    expect(notMine).toEqual(missing);
    expect(notMine.body).toEqual(
      new NotFoundException(REFERENCE_NOT_FOUND_MESSAGE).getResponse(),
    );
  });

  it('runs the same single owner-scoped query for not-owned and missing references', async () => {
    const { controller, queries } = makeController();
    await failureOf(controller.mineByReference(citizen1, 'PRC-2026-000042'));
    await failureOf(controller.mineByReference(citizen1, 'PRC-2026-999999'));
    expect(queries).toHaveLength(2);
    expect(queries[0].text).toBe(queries[1].text);
    expect(queries[0].text).toMatch(
      /WHERE r\.tracking_reference = \? AND r\.citizen_id = \?/,
    );
    expect(queries[0].text).toMatch(/SELECT r\.id FROM reports r/);
  });

  it('the 404 message is the one the My Reports search shows', () => {
    const frontend = readFileSync(
      join(
        __dirname,
        '..',
        '..',
        '..',
        'lib',
        'utils',
        'tracking-reference.ts',
      ),
      'utf8',
    );
    expect(frontend).toContain(
      `export const REFERENCE_NOT_FOUND = "${REFERENCE_NOT_FOUND_MESSAGE}";`,
    );
  });

  it('a malformed reference gets the same 404, without a query', async () => {
    const { controller, queries } = makeController();
    const missing = await failureOf(
      controller.mineByReference(citizen1, 'PRC-2026-999999'),
    );
    for (const bad of ['', 'not-a-ref', 'PRC-2026-12', '41']) {
      expect(
        await failureOf(controller.mineByReference(citizen1, bad)),
      ).toEqual(missing);
    }
    expect(queries).toHaveLength(1);
  });
});

describe('reference lookup throttle', () => {
  it(`allows ${REFERENCE_LOOKUP_LIMIT} lookups a minute per citizen, then refuses`, () => {
    const counter = new SlidingWindowCounter(
      REFERENCE_LOOKUP_LIMIT,
      REFERENCE_LOOKUP_WINDOW_MS,
    );
    const t0 = 1_000_000;
    for (let i = 0; i < REFERENCE_LOOKUP_LIMIT; i++) {
      expect(counter.hit('citizen:1', t0 + i)).toBe(true);
    }
    expect(counter.hit('citizen:1', t0 + 100)).toBe(false);
    // Another citizen is counted separately.
    expect(counter.hit('citizen:2', t0 + 100)).toBe(true);
    // A minute after the first hits, the window has room again.
    expect(counter.hit('citizen:1', t0 + REFERENCE_LOOKUP_WINDOW_MS + 1)).toBe(
      true,
    );
  });

  it('the guard answers 429 once a citizen is over the limit', () => {
    const guard = new ReferenceLookupRateLimitGuard();
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ citizenSession: { citizenId: 7 } }),
      }),
    } as unknown as ExecutionContext;
    for (let i = 0; i < REFERENCE_LOOKUP_LIMIT; i++) {
      expect(guard.canActivate(context)).toBe(true);
    }
    let status: number | undefined;
    try {
      guard.canActivate(context);
    } catch (err) {
      status = (err as HttpException).getStatus();
    }
    expect(status).toBe(429);
  });

  it('is applied to the route, behind the citizen session guard', () => {
    const guards = Reflect.getMetadata(
      '__guards__',
      // Read as metadata only, never called.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      ReportsController.prototype.mineByReference,
    ) as unknown[];
    expect(guards).toContain(ReferenceLookupRateLimitGuard);
    const classGuards = Reflect.getMetadata(
      '__guards__',
      ReportsController,
    ) as { name: string }[];
    expect(classGuards.map((g) => g.name)).toContain('CitizenSessionGuard');
  });
});
