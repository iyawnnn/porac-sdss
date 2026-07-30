import { Inject, Injectable } from '@nestjs/common';
import type { Sql } from 'postgres';
import { PG } from '../db/db.module';

@Injectable()
export class ElevationService {
  constructor(@Inject(PG) private readonly pg: Sql) {}

  async findNearestElevation(lat: number, lng: number): Promise<number> {
    const [row] = await this.pg<{ elevation_m: number }[]>`
      SELECT elevation_m
      FROM dem_points
      ORDER BY geom <-> ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)
      LIMIT 1
    `;
    return row.elevation_m;
  }
}
