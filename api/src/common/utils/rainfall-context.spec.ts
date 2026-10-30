import {
  RAINFALL_PROVIDER,
  RAINFALL_VALUE_LABEL,
  isRainfallCategory,
  parseCurrentWeather,
  rainfallLocationKey,
  rainfallQueryUrl,
  redactSecrets,
} from './rainfall-context';

// Manuscript revision Phase 4, step 4c. Pure helpers only; the network call
// is tested with a mocked fetch in rainfall-context.service.spec.ts.

describe('isRainfallCategory', () => {
  it.each([
    'Localized Flooding',
    'Flooding',
    'Rain-Induced Slope Failure/Landslide',
    'Landslide / Slope Failure',
  ])('%s gets rainfall context (legacy names too)', (category) => {
    expect(isRainfallCategory(category)).toBe(true);
  });

  it.each([
    'Lahar or Volcanic Debris-Flow Threat',
    'Fallen Tree or Storm-Related Road Obstruction',
    'Clogged Drainage / Damaged Culvert',
    'Pothole / Road Surface Damage',
    '',
  ])('%j does not', (category) => {
    expect(isRainfallCategory(category)).toBe(false);
  });
});

describe('rainfallLocationKey (same-location cache key)', () => {
  it('rounds the point to 4 decimals', () => {
    expect(rainfallLocationKey(15.080049, 120.539951)).toBe('15.0800,120.5400');
  });

  it('points within the same 4-decimal cell share a key; the next cell does not', () => {
    expect(rainfallLocationKey(15.08001, 120.54)).toBe(
      rainfallLocationKey(15.08004, 120.54),
    );
    expect(rainfallLocationKey(15.0801, 120.54)).not.toBe(
      rainfallLocationKey(15.08, 120.54),
    );
  });
});

describe('rainfallQueryUrl', () => {
  it('asks OpenWeatherMap Current Weather at the rounded point', () => {
    const url = new URL(rainfallQueryUrl('15.0800,120.5400', 'k3y'));
    expect(url.origin + url.pathname).toBe(
      'https://api.openweathermap.org/data/2.5/weather',
    );
    expect(url.searchParams.get('lat')).toBe('15.0800');
    expect(url.searchParams.get('lon')).toBe('120.5400');
    expect(url.searchParams.get('appid')).toBe('k3y');
  });
});

describe('redactSecrets', () => {
  it('removes an appid parameter and the key itself', () => {
    const key = 'abc123secret';
    const text = `request to https://api.openweathermap.org/data/2.5/weather?lat=1&lon=2&appid=${key} failed (key ${key})`;
    const out = redactSecrets(text, key);
    expect(out).not.toContain(key);
    expect(out).toContain('appid=[redacted]');
    expect(out).toContain('(key [redacted])');
  });

  it('leaves text without a key alone', () => {
    expect(redactSecrets('HTTP 503', 'abc123secret')).toBe('HTTP 503');
  });
});

describe('parseCurrentWeather', () => {
  const dt = 1_793_350_800; // 2026-10-30T09:00:00Z

  it('rain.1h -> that many mm, observed at the provider dt', () => {
    expect(parseCurrentWeather({ dt, rain: { '1h': 3.25 } })).toEqual({
      ok: true,
      rainfallMm: 3.25,
      observationAt: new Date(dt * 1000),
    });
  });

  it('a numeric dt and no rain object -> a real 0 mm (the provider omits rain when dry)', () => {
    expect(parseCurrentWeather({ dt, weather: [{ main: 'Clear' }] })).toEqual({
      ok: true,
      rainfallMm: 0,
      observationAt: new Date(dt * 1000),
    });
  });

  it('rain.1h = 0 -> 0 mm, not a failure', () => {
    expect(parseCurrentWeather({ dt, rain: { '1h': 0 } })).toMatchObject({
      ok: true,
      rainfallMm: 0,
    });
  });

  it.each([
    [{ rain: { '1h': 2 } }, 'Unexpected response: no observation time (dt)'],
    [{}, 'Unexpected response: no observation time (dt)'],
    [{ dt: '1793350800' }, 'Unexpected response: no observation time (dt)'],
    [{ dt: Number.NaN }, 'Unexpected response: no observation time (dt)'],
    [{ dt, rain: { '3h': 4 } }, 'Unexpected response: rain without a 1h value'],
    [
      { dt, rain: { '1h': -1 } },
      'Unexpected response: rain without a 1h value',
    ],
    [
      { dt, rain: { '1h': '2' } },
      'Unexpected response: rain without a 1h value',
    ],
    [{ dt, rain: 2 }, 'Unexpected response: rain is not an object'],
    [[], 'Unexpected response: not a JSON object'],
    [null, 'Unexpected response: not a JSON object'],
    ['ok', 'Unexpected response: not a JSON object'],
  ])('%j is a failure, never 0 mm', (body, reason) => {
    expect(parseCurrentWeather(body)).toEqual({
      ok: false,
      failureReason: reason,
    });
  });
});

it('provider and value label', () => {
  expect(RAINFALL_PROVIDER).toBe('OpenWeatherMap');
  expect(RAINFALL_VALUE_LABEL).toBe('Rainfall (last hour)');
});
