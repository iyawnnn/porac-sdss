import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Sql } from 'postgres';
import type { Env } from '../config/env';
import { WeatherService } from './weather.service';

function makePg(results: unknown[]): Sql {
  const pg = jest.fn();
  for (const result of results) {
    pg.mockResolvedValueOnce(result);
  }
  return pg as unknown as Sql;
}

function makeConfig(apiKey = 'fake-openweathermap-key'): ConfigService<Env, true> {
  return {
    get: (key: string) => (key === 'OPENWEATHERMAP_API_KEY' ? apiKey : undefined),
  } as unknown as ConfigService<Env, true>;
}

function freshCacheRow(value: number) {
  return [
    { value: String(value), computed_at: new Date(Date.now() - 5 * 60 * 1000).toISOString() },
  ];
}

function staleCacheRow(value: number) {
  return [
    { value: String(value), computed_at: new Date(Date.now() - 20 * 60 * 1000).toISOString() },
  ];
}

function okFetchResponse(rain1h: number | undefined) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(rain1h === undefined ? {} : { rain: { '1h': rain1h } }),
  } as Response;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('WeatherService.getCurrentRain1hMm — cache behavior', () => {
  it('returns the cached value directly when the cache is fresh, without calling fetch', async () => {
    const pg = makePg([freshCacheRow(2.5)]);
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(okFetchResponse(9));
    const service = new WeatherService(pg, makeConfig());

    const result = await service.getCurrentRain1hMm();

    expect(result).toBe(2.5);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('fetches and updates the cache when there is no cached row', async () => {
    const pg = makePg([[], []]);
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(okFetchResponse(4.2));
    const service = new WeatherService(pg, makeConfig());

    const result = await service.getCurrentRain1hMm();

    expect(result).toBe(4.2);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(pg).toHaveBeenCalledTimes(2); // SELECT then INSERT/upsert
  });

  it('fetches a live value and ignores a stale cached row (TTL expired)', async () => {
    const pg = makePg([staleCacheRow(1.1), []]);
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(okFetchResponse(6.7));
    const service = new WeatherService(pg, makeConfig());

    const result = await service.getCurrentRain1hMm();

    expect(result).toBe(6.7);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('WeatherService.getCurrentRain1hMm — provider HTTP error fallback', () => {
  it('falls back to 0 and logs when there is no cache and the provider returns non-2xx', async () => {
    const pg = makePg([[]]);
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({}),
    } as Response);
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const service = new WeatherService(pg, makeConfig('super-secret-openweather-key'));

    const result = await service.getCurrentRain1hMm();

    expect(result).toBe(0);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [loggedMessage] = errorSpy.mock.calls[0] as [string];
    expect(loggedMessage).not.toContain('super-secret-openweather-key');
    errorSpy.mockRestore();
  });

  it('falls back to the stale cached value (not 0) when the provider returns non-2xx and a stale cache exists', async () => {
    const pg = makePg([staleCacheRow(3.3)]);
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 429,
      json: () => Promise.resolve({}),
    } as Response);
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const service = new WeatherService(pg, makeConfig());

    const result = await service.getCurrentRain1hMm();

    expect(result).toBe(3.3);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});

describe('WeatherService.getCurrentRain1hMm — network exception fallback', () => {
  it('falls back to 0 and logs when fetch throws and there is no cache', async () => {
    const pg = makePg([[]]);
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network unreachable'));
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const service = new WeatherService(pg, makeConfig('super-secret-openweather-key'));

    const result = await service.getCurrentRain1hMm();

    expect(result).toBe(0);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [loggedMessage] = errorSpy.mock.calls[0] as [string];
    expect(loggedMessage).toContain('network unreachable');
    expect(loggedMessage).not.toContain('super-secret-openweather-key');
    errorSpy.mockRestore();
  });

  it('falls back to the stale cached value when fetch throws and a stale cache exists', async () => {
    const pg = makePg([staleCacheRow(5.9)]);
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('timeout'));
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const service = new WeatherService(pg, makeConfig());

    const result = await service.getCurrentRain1hMm();

    expect(result).toBe(5.9);
    errorSpy.mockRestore();
  });
});

describe('WeatherService.getCurrentRain1hMm — malformed payload', () => {
  it('treats a response with no rain field as 0mm via the normal success path, not the fallback path', async () => {
    const pg = makePg([[], []]);
    jest.spyOn(global, 'fetch').mockResolvedValue(okFetchResponse(undefined));
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const service = new WeatherService(pg, makeConfig());

    const result = await service.getCurrentRain1hMm();

    expect(result).toBe(0);
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('falls back gracefully when the response body is not valid JSON', async () => {
    const pg = makePg([[]]);
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
    } as Response);
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const service = new WeatherService(pg, makeConfig());

    const result = await service.getCurrentRain1hMm();

    expect(result).toBe(0);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});
