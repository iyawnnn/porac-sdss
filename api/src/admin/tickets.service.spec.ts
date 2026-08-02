import { TicketsService } from './tickets.service';
import type { Sql } from 'postgres';
import type { WeatherService } from '../domain/weather.service';
import type { MediaService } from '../domain/media.service';

describe('parseTicketQuery category filter', () => {
  const sql = jest.fn() as unknown as Sql;
  const service = new TicketsService(
    sql,
    {} as WeatherService,
    {} as MediaService,
  );

  it.each(['Flooding', 'Pothole', 'Other'])(
    'accepts a known category %s',
    (category) => {
      expect(service.parseTicketQuery({ category }).category).toBe(category);
    },
  );

  it('rejects an unknown category', () => {
    expect(
      service.parseTicketQuery({ category: 'Not A Real Category' }).category,
    ).toBeUndefined();
  });

  it('defaults to undefined when category is absent', () => {
    expect(service.parseTicketQuery({}).category).toBeUndefined();
  });
});
