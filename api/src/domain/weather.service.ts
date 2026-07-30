import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Sql } from 'postgres';
import { PG } from '../db/db.module';
import { MUNICIPALITY } from './municipality-config';
import type { Env } from '../config/env';

const CACHE_KEY = 'rain_1h_mm';
const CACHE_TTL_MS = 10 * 60 * 1000; // matches the cron recompute interval

@Injectable()
export class WeatherService {
  constructor(
    @Inject(PG) private readonly pg: Sql,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // Cached in the config table (not in-memory) so the value survives across
  // cold starts and is shared between the cron route and report submission,
  // instead of every cold start re-hitting the API.
  async getCurrentRain1hMm(): Promise<number> {
    const sql = this.pg;

    const [cached] = await sql<{ value: string; computed_at: string }[]>`
      SELECT value, computed_at FROM config WHERE key = ${CACHE_KEY}
    `;

    if (
      cached &&
      Date.now() - new Date(cached.computed_at).getTime() < CACHE_TTL_MS
    ) {
      return Number(cached.value);
    }

    const apiKey = this.config.get('OPENWEATHERMAP_API_KEY', { infer: true });
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${MUNICIPALITY.centerLat}&lon=${MUNICIPALITY.centerLng}&appid=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`OpenWeatherMap request failed: ${res.status}`);
    }

    const data = (await res.json()) as { rain?: { '1h'?: number } };
    const rain1hMm = data.rain?.['1h'] ?? 0;

    await sql`
      INSERT INTO config (key, value, note)
      VALUES (
        ${CACHE_KEY}, ${String(rain1hMm)},
        'Live OpenWeatherMap rain["1h"] mm, cached ~10 min. Refreshed by cron recompute and/or report submission. NOT a fixed constant like elev_min/elev_max.'
      )
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value, computed_at = now(), note = EXCLUDED.note
    `;

    return rain1hMm;
  }
}
