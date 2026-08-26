import { BadRequestException } from '@nestjs/common';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import {
  SavedViewsService,
  SAVED_VIEWS_MAX_PER_ADMIN,
  parseSavedViewSurface,
} from './saved-views.service';
import type { AdminSession } from '../auth/session.service';

const ADMIN: AdminSession = {
  adminId: 7,
  email: 'officer@example.com',
  adminName: 'MEO Officer',
  office: 'MEO',
  role: 'officer',
};

// Same fake-drizzle shape as admins.service.spec.ts: chains the builder calls
// production code makes and resolves to the rows it was seeded with.
function chain(rows: Record<string, unknown>[]) {
  const obj: Record<string, unknown> = {};
  const self = () => obj;
  obj.from = self;
  obj.where = self;
  obj.orderBy = self;
  obj.values = self;
  obj.set = self;
  obj.returning = () => Promise.resolve(rows);
  obj.then = (
    resolve: (v: unknown) => unknown,
    reject?: (e: unknown) => unknown,
  ) => Promise.resolve(rows).then(resolve, reject);
  return obj;
}

function makeService(insertedRows: Record<string, unknown>[] = [{ id: 1, name: 'n', query: 'q', position: 0 }]) {
  const values = jest.fn().mockReturnValue(chain(insertedRows));
  const db = {
    select: jest.fn().mockReturnValue(chain([])),
    insert: jest.fn().mockReturnValue({ values }),
    update: jest.fn().mockReturnValue(chain(insertedRows)),
    delete: jest.fn().mockReturnValue(chain(insertedRows)),
  } as unknown as PostgresJsDatabase;
  return { service: new SavedViewsService(db), db, values };
}

describe('parseSavedViewSurface', () => {
  it('accepts the two known surfaces', () => {
    expect(parseSavedViewSurface('tickets')).toBe('tickets');
    expect(parseSavedViewSurface('flagged')).toBe('flagged');
  });

  // The Ticket Queue shipped before this column existed and still calls the
  // endpoints without a surface — that request must keep meaning 'tickets'.
  it('falls back to tickets for a missing or unknown value', () => {
    expect(parseSavedViewSurface(undefined)).toBe('tickets');
    expect(parseSavedViewSurface('')).toBe('tickets');
    expect(parseSavedViewSurface('FLAGGED')).toBe('tickets');
    expect(parseSavedViewSurface('reports')).toBe('tickets');
    expect(parseSavedViewSurface(42)).toBe('tickets');
  });
});

describe('SavedViewsService.create', () => {
  it('stores the surface alongside the preset', async () => {
    const { service, values } = makeService();
    jest.spyOn(service, 'list').mockResolvedValue([]);

    await service.create(ADMIN, 'Needs review', 'status=quarantined', 'flagged');

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        adminId: 7,
        name: 'Needs review',
        query: 'status=quarantined',
        surface: 'flagged',
      }),
    );
  });

  it('defaults to the tickets surface when none is given', async () => {
    const { service, values } = makeService();
    jest.spyOn(service, 'list').mockResolvedValue([]);

    await service.create(ADMIN, 'High urgency', 'urgency=High');

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ surface: 'tickets' }),
    );
  });

  // The cap and the same-name overwrite are both per surface. If create()
  // counted every preset the admin owns, a full Ticket Queue strip would
  // block saving anything on Flagged Reports.
  it('counts the per-admin cap within one surface only', async () => {
    const { service } = makeService();
    const list = jest.spyOn(service, 'list').mockResolvedValue([]);

    await service.create(ADMIN, 'Needs review', 'status=quarantined', 'flagged');

    expect(list).toHaveBeenCalledWith(ADMIN, 'flagged');
  });

  it('rejects a new preset once the surface is at the cap', async () => {
    const { service } = makeService();
    jest.spyOn(service, 'list').mockResolvedValue(
      Array.from({ length: SAVED_VIEWS_MAX_PER_ADMIN }, (_, i) => ({
        id: i + 1,
        name: `view-${i}`,
        query: '',
        position: i,
      })),
    );

    await expect(
      service.create(ADMIN, 'One more', 'status=pending', 'flagged'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('overwrites a same-named preset on the same surface instead of adding a second tab', async () => {
    const { service, db, values } = makeService();
    jest.spyOn(service, 'list').mockResolvedValue([
      { id: 3, name: 'Needs review', query: 'status=pending', position: 0 },
    ]);

    await service.create(ADMIN, 'Needs review', 'status=quarantined', 'flagged');

    expect(db.update).toHaveBeenCalled();
    expect(values).not.toHaveBeenCalled();
  });
});
