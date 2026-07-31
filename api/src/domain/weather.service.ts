import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Sql } from 'postgres';
import { PG } from '../db/db.module';
import { MUNICIPALITY } from './municipality-config';
import type { Env } from '../config/env';

const CACHE_KEY = 'rain_1h_mm';
const CACHE_TTL_MS = 10 * 60 * 1000; // matches the cron recompute interval
const FETCH_TIMEOUT_MS = 5000;

@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);

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

    // Every admin dashboard/ticket-queue read recomputes urgency first,
    // which calls this — an unguarded network failure here (timeout, rate
    // limit, DNS blip) would otherwise 500 those routes entirely. Fall back
    // to the stale cached value (or 0mm if there's never been one) instead
    // of throwing, and log so the outage is still visible.
    try {
      const rain1hMm = await this.fetchRain1hMm();
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
    } catch (err) {
      this.logger.error(
        `OpenWeatherMap fetch failed, falling back to ${cached ? 'stale cached' : 'default 0mm'} rain value: ${err instanceof Error ? err.message : err}`,
      );
      return cached ? Number(cached.value) : 0;
    }
  }

  private async fetchRain1hMm(): Promise<number> {
    const apiKey = this.config.get('OPENWEATHERMAP_API_KEY', { infer: true });
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${MUNICIPALITY.centerLat}&lon=${MUNICIPALITY.centerLng}&appid=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) {
      throw new Error(`OpenWeatherMap request failed: ${res.status}`);
    }

    const data = (await res.json()) as { rain?: { '1h'?: number } };
    return data.rain?.['1h'] ?? 0;
  }
}
