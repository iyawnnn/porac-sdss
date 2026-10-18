import type { Sql } from 'postgres';
import { RecomputeService } from './recompute.service';
import type { WeatherService } from './weather.service';
import type { AppConfigService } from './app-config.service';
import type { NotificationsService } from '../notifications/notifications.service';

// Phase 1 step 1 guard: Hazard Urgency recompute must no longer read the
// Operational Priority inputs or write priority_index — that belongs to
// OperationalPriorityService now.
describe('RecomputeService.recomputeActiveTicketUrgency (Hazard Urgency only)', () => {
  function setup(rows: unknown[]) {
    const tx = jest.fn().mockResolvedValue([]);
    const sqlMock = Object.assign(jest.fn().mockResolvedValue(rows), {
      begin: jest.fn((cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
    });
    const sql = sqlMock as unknown as Sql & jest.Mock;
    const weather = {
      getCurrentRain1hMm: jest.fn().mockResolvedValue(0),
    } as unknown as WeatherService;
    const appConfig = {
      getElevationBounds: jest
        .fn()
        .mockResolvedValue({ elevMin: 0, elevMax: 100 }),
    } as unknown as AppConfigService;
    const notifications = {
      createInTx: jest.fn(),
    } as unknown as NotificationsService;
    const service = new RecomputeService(
      sql,
      weather,
      appConfig,
      notifications,
    );
    return { service, sql, tx };
  }

  it('does not select severity/age/density inputs', async () => {
    const { service, sql } = setup([]);
    await expect(service.recomputeActiveTicketUrgency(0)).resolves.toEqual({
      updated: 0,
      rain1hMm: 0,
    });
    const select = (sql.mock.calls[0][0] as readonly string[]).join('?');
    expect(select).not.toContain('severity_rank');
    expect(select).not.toContain('barangay_density');
    expect(select).toContain(
      "t.status IN ('Reported', 'Under Review', 'In Progress')",
    );
  });

  it('still writes the Hazard Urgency columns but never priority_index', async () => {
    const { service, tx } = setup([
      {
        id: 5,
        elevation_m: 20,
        member_count: 1,
        urgency_band: 'Low',
        assigned_office: 'MEO',
      },
    ]);
    await expect(service.recomputeActiveTicketUrgency(0)).resolves.toEqual({
      updated: 1,
      rain1hMm: 0,
    });
    const update = (tx.mock.calls[0][0] as readonly string[]).join('?');
    expect(update).toContain('priority_score = u.priority_score');
    expect(update).toContain('urgency_level = u.urgency_level');
    expect(update).not.toContain('priority_index');
  });
});
