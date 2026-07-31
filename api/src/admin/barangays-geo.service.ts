import { Inject, Injectable } from '@nestjs/common';
import type { Sql } from 'postgres';
import { PG } from '../db/db.module';

@Injectable()
export class BarangaysGeoService {
  constructor(@Inject(PG) private readonly pg: Sql) {}

  // Barangay polygons rarely change, so this doesn't need the
  // recompute-on-load treatment the ticket geo route gets — it's static
  // reference data.
  async getBarangaysGeoJson() {
    const rows = await this.pg<{ id: number; name: string; geojson: string }[]>`
      SELECT id, name, ST_AsGeoJSON(geom) AS geojson FROM barangays ORDER BY name
    `;

    return {
      type: 'FeatureCollection',
      features: rows.map((r) => ({
        type: 'Feature',
        properties: { id: r.id, name: r.name },
        geometry: JSON.parse(r.geojson),
      })),
    };
  }
}
