import { sql } from "@/lib/db/raw";
import { MUNICIPALITY } from "@/lib/municipality-config";

const CACHE_KEY = "rain_1h_mm";
const CACHE_TTL_MS = 10 * 60 * 1000; // matches the cron recompute interval

// Cached in the config table (not in-memory) so the value survives across
// serverless invocations and is shared between the cron route and report
// submission, instead of every cold start re-hitting the API.
export async function getCurrentRain1hMm(): Promise<number> {
  const [cached] = await sql<{ value: string; computed_at: string }[]>`
    SELECT value, computed_at FROM config WHERE key = ${CACHE_KEY}
  `;

  if (cached && Date.now() - new Date(cached.computed_at).getTime() < CACHE_TTL_MS) {
    return Number(cached.value);
  }

  const apiKey = process.env.OPENWEATHERMAP_API_KEY;
  if (!apiKey) {
    throw new Error("OPENWEATHERMAP_API_KEY is not set");
  }

  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${MUNICIPALITY.centerLat}&lon=${MUNICIPALITY.centerLng}&appid=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`OpenWeatherMap request failed: ${res.status}`);
  }

  const data = (await res.json()) as { rain?: { "1h"?: number } };
  const rain1hMm = data.rain?.["1h"] ?? 0;

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
