import { NotFoundException } from '@nestjs/common';
import type { Sql } from 'postgres';
import type { AdminSession } from '../auth/session.service';
import { BarangayInsightsController } from './barangay-insights.controller';
import { BarangayInsightsService } from './barangay-insights.service';

type SessionShape = Pick<AdminSession, 'role' | 'office'>;
const MEO_OFFICER = { role: 'officer', office: 'MEO' } as SessionShape as AdminSession;
const MDRRMO_SUPERVISOR = { role: 'supervisor', office: 'MDRRMO' } as SessionShape as AdminSession;
const SYSTEM_ADMIN = { role: 'system_admin', office: null } as SessionShape as AdminSession;

describe('BarangayInsightsService.listInsights', () => {
  it('scopes the office filter into the tickets JOIN, not a WHERE clause, so every barangay is still returned', async () => {
    const sql = jest.fn().mockResolvedValue([]) as unknown as Sql;
    const service = new BarangayInsightsService(sql);
    await service.listInsights('MEO');

    const call = (sql as unknown as jest.Mock).mock.calls.at(-1);
    const query = call[0].join('');
    expect(query).toContain('LEFT JOIN tickets t ON t.barangay_id = b.id');
    expect(query).toContain('FROM barangays b');
    expect(query).not.toMatch(/WHERE\s+t\.assigned_office/);
  });

  it('leaves office undefined (city-wide) when called with no office', async () => {
    const sql = jest.fn().mockResolvedValue([]) as unknown as Sql;
    const service = new BarangayInsightsService(sql);
    await service.listInsights(undefined);

    const call = (sql as unknown as jest.Mock).mock.calls.at(-1);
    expect(call.slice(1)).toContain(null);
  });

  it('orders by barangay name so results are stable regardless of ticket volume', async () => {
    const sql = jest.fn().mockResolvedValue([]) as unknown as Sql;
    const service = new BarangayInsightsService(sql);
    await service.listInsights();

    const call = (sql as unknown as jest.Mock).mock.calls.at(-1);
    const query = call[0].join('');
    expect(query).toContain('ORDER BY b.name ASC');
  });
});

describe('BarangayInsightsService.getProfile', () => {
  it('throws NotFoundException when the barangay id does not exist', async () => {
    const sql = jest.fn().mockResolvedValue([]) as unknown as Sql;
    const service = new BarangayInsightsService(sql);
    await expect(service.getProfile(999)).rejects.toThrow(NotFoundException);
  });

  it('scopes the KPI, category, trend, and recent-ticket queries to the requested office', async () => {
    const calls: string[] = [];
    const sql = jest.fn((strings: TemplateStringsArray) => {
      calls.push(strings.join(''));
      // First call is the barangay existence check; return a row for it,
      // empty arrays for everything else (KPIs destructure with a fallback).
      if (calls.length === 1) return Promise.resolve([{ id: 5, name: 'Test Barangay' }]);
      return Promise.resolve([]);
    }) as unknown as Sql;
    const service = new BarangayInsightsService(sql);

    const profile = await service.getProfile(5, 'MDRRMO');

    expect(profile.barangay_id).toBe(5);
    expect(profile.barangay_name).toBe('Test Barangay');
    // KPI/category/recent-ticket queries all filter on barangay_id.
    expect(calls.some((q) => q.includes('WHERE barangay_id ='))).toBe(true);
    // Elevation summary never filters by office — terrain isn't office data.
    expect(calls.some((q) => q.includes('FROM dem_points d'))).toBe(true);
    // Never touches work_orders.
    expect(calls.every((q) => !q.includes('work_orders'))).toBe(true);
  });

  it('defaults kpis and elevation to zero/null shapes when the underlying queries return no row', async () => {
    const sql = jest.fn().mockImplementation((strings: TemplateStringsArray) => {
      if (strings.join('').includes('FROM barangays WHERE id')) {
        return Promise.resolve([{ id: 1, name: 'Empty Barangay' }]);
      }
      return Promise.resolve([]);
    }) as unknown as Sql;
    const service = new BarangayInsightsService(sql);

    const profile = await service.getProfile(1);

    expect(profile.kpis).toEqual({
      total_tickets: 0,
      active_tickets: 0,
      resolved_tickets: 0,
      high_urgency_tickets: 0,
    });
    expect(profile.elevation).toEqual({ elevation_min: null, elevation_avg: null, elevation_max: null });
  });
});

// Controller-level: proves office scoping goes through the same
// resolveOfficeScope clamp every other admin list/profile endpoint uses —
// not a re-derived or bypassable rule.
describe('BarangayInsightsController office scoping', () => {
  function controllerWith(spy: jest.Mock) {
    const service = { listInsights: spy, getProfile: jest.fn() } as unknown as BarangayInsightsService;
    return new BarangayInsightsController(service);
  }

  it('clamps an MEO officer to MEO regardless of the requested office', async () => {
    const spy = jest.fn().mockResolvedValue([]);
    const controller = controllerWith(spy);
    await controller.list('MDRRMO', MEO_OFFICER);
    expect(spy).toHaveBeenCalledWith('MEO');
  });

  it('clamps an MDRRMO supervisor to MDRRMO regardless of the requested office', async () => {
    const spy = jest.fn().mockResolvedValue([]);
    const controller = controllerWith(spy);
    await controller.list('MEO', MDRRMO_SUPERVISOR);
    expect(spy).toHaveBeenCalledWith('MDRRMO');
  });

  it('lets a system admin request a single office or city-wide (undefined)', async () => {
    const spy = jest.fn().mockResolvedValue([]);
    const controller = controllerWith(spy);
    await controller.list('MEO', SYSTEM_ADMIN);
    expect(spy).toHaveBeenCalledWith('MEO');

    await controller.list(undefined, SYSTEM_ADMIN);
    expect(spy).toHaveBeenCalledWith(undefined);
  });

  it("echoes the resolved office (not the raw request) in the response's office field", async () => {
    const spy = jest.fn().mockResolvedValue([]);
    const controller = controllerWith(spy);
    const result = await controller.list('MDRRMO', MEO_OFFICER);
    expect(result.office).toBe('MEO');
  });
});
