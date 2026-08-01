import { Inject, Injectable } from '@nestjs/common';
import type { Sql } from 'postgres';
import { PG } from '../db/db.module';

// Named AppConfigService, not ConfigService, to avoid colliding with
// @nestjs/config's ConfigService (env vars) — this reads the DB-backed
// `config` table instead.
@Injectable()
export class AppConfigService {
  constructor(@Inject(PG) private readonly pg: Sql) {}

  // elev_min/elev_max are fixed constants seeded in Phase 0 (config table),
  // computed via ST_Contains against the barangay polygons. Never
  // recomputed live — see scripts/verify-config.ts.
  async getElevationBounds(): Promise<{ elevMin: number; elevMax: number }> {
    const rows = await this.pg<{ key: string; value: string }[]>`
      SELECT key, value FROM config WHERE key IN ('elev_min', 'elev_max')
    `;
    const map = Object.fromEntries(rows.map((r) => [r.key, Number(r.value)]));
    return { elevMin: map.elev_min, elevMax: map.elev_max };
  }
}
