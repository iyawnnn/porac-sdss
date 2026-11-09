import type { Sql } from 'postgres';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../src/config/env';
import { MediaService } from '../../src/domain/media.service';
import { BarangayService } from '../../src/domain/barangay.service';
import { RateLimitService } from '../../src/domain/ratelimit.service';
import { OperationalPriorityService } from '../../src/domain/operational-priority.service';
import { HazardInformationService } from '../../src/domain/hazard-information.service';
import { RainfallContextService } from '../../src/domain/rainfall-context.service';
import type { HazardLookupResult } from '../../src/common/utils/hazard-information';
import type { RainfallFetchResult } from '../../src/common/utils/rainfall-context';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { AdminAuditService } from '../../src/admin/admin-audit.service';
import { ReportsService } from '../../src/reports/reports.service';
import { TicketsService } from '../../src/admin/tickets.service';
import { FocalIntakeService } from '../../src/admin/focal-intake.service';
import { OperationalAssessmentService } from '../../src/admin/operational-assessment.service';
import { WorkOrdersService } from '../../src/admin/work-orders.service';
import { RelatedTicketsService } from '../../src/admin/related-tickets.service';
import { TicketGroupingService } from '../../src/admin/ticket-grouping.service';
import { ConsoleEmailService } from '../../src/citizens/email.service';

export class DemoMediaService extends MediaService {
  constructor(
    private readonly storeImage: (buffer: Buffer) => Promise<string>,
  ) {
    super();
  }
  override uploadImage(buffer: Buffer): Promise<string> {
    return this.storeImage(buffer);
  }
}

// Provider boundaries and background scheduling are controlled here. The real
// lookup/refresh methods still
// write and validate their rows. No fetch, API key or live weather/GIS request.
class DemoHazardService extends HazardInformationService {
  result: HazardLookupResult = {
    lookupStatus: 'TEMPORARILY_UNAVAILABLE',
    susceptibilityCode: null,
    susceptibilityLabel: null,
    failureReason: 'Offline demonstration source unavailable',
  };
  override triggerForNewTicket(): void {
    /* Leave pending until the scenario explicitly looks up. */
  }
  override queryLayer(): Promise<HazardLookupResult> {
    return Promise.resolve(this.result);
  }
}
class DemoRainfallService extends RainfallContextService {
  result: RainfallFetchResult = {
    ok: false,
    failureReason: 'Offline demonstration source unavailable',
  };
  override fetchReading(): Promise<RainfallFetchResult> {
    return Promise.resolve(this.result);
  }
}

export function demoServices(
  pg: Sql,
  db: PostgresJsDatabase,
  media: DemoMediaService,
) {
  const config = new ConfigService<Env, true>({
    WEB_ORIGIN: 'http://localhost:3000',
    NODE_ENV: 'development',
    HAZARD_INFORMATION_LOOKUPS: 'enabled',
    RAINFALL_LOOKUPS: 'enabled',
  });
  const notifications = new NotificationsService(db);
  const audit = new AdminAuditService(db);
  const barangays = new BarangayService(pg);
  const priority = new OperationalPriorityService(pg);
  const rateLimit = new RateLimitService(pg);
  const hazard = new DemoHazardService(pg, config);
  const rainfall = new DemoRainfallService(pg, config);
  const tickets = new TicketsService(
    pg,
    media,
    notifications,
    new ConsoleEmailService(config),
    config,
    audit,
    priority,
  );
  return {
    reports: new ReportsService(
      pg,
      barangays,
      media,
      rateLimit,
      priority,
      notifications,
      hazard,
    ),
    focal: new FocalIntakeService(pg, tickets, notifications, audit),
    assessment: new OperationalAssessmentService(pg, audit),
    orders: new WorkOrdersService(db, notifications, audit),
    grouping: new TicketGroupingService(pg, barangays, priority, audit),
    related: new RelatedTicketsService(pg),
    tickets,
    hazard,
    rainfall,
    rateLimit,
    barangays,
  };
}
