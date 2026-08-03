import { TicketsService } from './tickets.service';
import type { Sql } from 'postgres';
import type { ConfigService } from '@nestjs/config';
import type { WeatherService } from '../domain/weather.service';
import type { MediaService } from '../domain/media.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { EmailService } from '../citizens/email.service';
import type { Env } from '../config/env';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('parseTicketQuery category filter', () => {
  const sql = jest.fn() as unknown as Sql;
  const service = new TicketsService(
    sql,
    {} as WeatherService,
    {} as MediaService,
    {} as NotificationsService,
    {} as EmailService,
    {} as ConfigService<Env, true>,
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

describe('ticket-status notification email selection', () => {
  const ticketsServiceSource = readFileSync(
    join(__dirname, 'tickets.service.ts'),
    'utf8',
  );

  it('keeps email delivery post-commit and limited to resolved/rejected tickets', () => {
    expect(ticketsServiceSource).toMatch(
      /return nextStatus === 'Resolved' \|\| nextStatus === 'Rejected'/,
    );
    expect(ticketsServiceSource).toMatch(
      /const emailRecipients = await sql\.begin[\s\S]*?if \(emailRecipients\.length > 0\)/,
    );
    expect(ticketsServiceSource).toMatch(/this\.email\.sendReportResolved/);
    expect(ticketsServiceSource).toMatch(/this\.email\.sendReportRejected/);
  });

  it('does not add email delivery to routine in-app-only status updates', () => {
    expect(ticketsServiceSource).not.toMatch(/sendReportReceived/);
    expect(ticketsServiceSource).not.toMatch(/sendTicketUnderReview/);
    expect(ticketsServiceSource).not.toMatch(/sendTicketInProgress/);
  });
});
