// Per-ticket rainfall context (manuscript p. 72, Appendix H
// RAINFALL_CONTEXT; manuscript revision Phase 4, step 4c). Pure helpers:
// which categories get rainfall context, the provider request, how its
// answer maps to a reading, and the same-location cache key.
// RainfallContextService does the network call and the writes.
//
// Advisory only. Rainfall is never a score and never changes Operational
// Priority, report validity, DENR-MGB Hazard Information or any rule.

// The provider, as stored in rainfall_context.source_provider.
export const RAINFALL_PROVIDER = 'OpenWeatherMap';

// What the stored value is: OpenWeatherMap Current Weather's rain["1h"],
// the rain volume over the last hour, in mm (the provider reports this
// field in mm whatever the units parameter).
export const RAINFALL_VALUE_LABEL = 'Rainfall (last hour)';

const OWM_CURRENT_WEATHER_URL =
  'https://api.openweathermap.org/data/2.5/weather';

// Localized Flooding and Rain-Induced Slope Failure/Landslide, plus the
// legacy names docs/database.md maps to them, so older tickets that still
// carry one behave the same (the same four names as Hazard Information's
// applicable categories, kept here separately: rainfall context is
// maintained apart from Hazard Information).
const RAINFALL_CATEGORIES: ReadonlySet<string> = new Set([
  'Localized Flooding',
  'Flooding',
  'Rain-Induced Slope Failure/Landslide',
  'Landslide / Slope Failure',
]);

export function isRainfallCategory(category: string): boolean {
  return RAINFALL_CATEGORIES.has(category);
}

// The same-location key: the point rounded to 4 decimals (about 11 m at
// Porac's latitude). Tickets this close share one reading for up to 10
// minutes; the provider's own grid is far coarser, so a finer key would only
// repeat calls, and a coarser one would stretch "same location". The
// provider is asked at exactly this rounded point.
export function rainfallLocationKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

// The request URL. It carries the API key, so it is never logged or stored:
// everything that leaves the service goes through redactSecrets.
export function rainfallQueryUrl(key: string, apiKey: string): string {
  const [lat, lon] = key.split(',');
  const params = new URLSearchParams({ lat, lon, appid: apiKey });
  return `${OWM_CURRENT_WEATHER_URL}?${params.toString()}`;
}

// Removes the API key from any text (an appid=... parameter, and the key
// itself wherever it appears).
export function redactSecrets(text: string, apiKey: string): string {
  let out = text.replace(/appid=[^&\s"']*/gi, 'appid=[redacted]');
  if (apiKey) out = out.split(apiKey).join('[redacted]');
  return out;
}

export type RainfallFetchResult =
  | { ok: true; rainfallMm: number; observationAt: Date }
  | { ok: false; failureReason: string };

export function fetchFailure(reason: string): RainfallFetchResult {
  return { ok: false, failureReason: reason.slice(0, 500) };
}

// Maps a parsed HTTP 200 Current Weather response. The provider leaves the
// rain object out when it isn't raining, so a response with a numeric dt
// (its observation time, unix seconds) and no rain object is a real 0 mm.
// Without a numeric dt it is not a reading at all, and a rain object without
// a usable 1h value is never turned into 0.
export function parseCurrentWeather(body: unknown): RainfallFetchResult {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return fetchFailure('Unexpected response: not a JSON object');
  }
  const json = body as { dt?: unknown; rain?: unknown };
  if (typeof json.dt !== 'number' || !Number.isFinite(json.dt)) {
    return fetchFailure('Unexpected response: no observation time (dt)');
  }
  const observationAt = new Date(json.dt * 1000);
  if (json.rain === undefined || json.rain === null) {
    return { ok: true, rainfallMm: 0, observationAt };
  }
  if (typeof json.rain !== 'object' || Array.isArray(json.rain)) {
    return fetchFailure('Unexpected response: rain is not an object');
  }
  const value = (json.rain as Record<string, unknown>)['1h'];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return fetchFailure('Unexpected response: rain without a 1h value');
  }
  return { ok: true, rainfallMm: value, observationAt };
}
