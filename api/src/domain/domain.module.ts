import { Module } from '@nestjs/common';
import { BarangayService } from './barangay.service';
import { OperationalPriorityService } from './operational-priority.service';
import { MediaService } from './media.service';
import { RateLimitService } from './ratelimit.service';
import { HazardInformationService } from './hazard-information.service';
import { RainfallContextService } from './rainfall-context.service';
import { NotificationsModule } from '../notifications/notifications.module';

// No controllers — feature modules (auth, reports, admin, cron) import
// this and build their own routes around these services. The Hazard Urgency
// services (RecomputeService, WeatherService, ElevationService,
// AppConfigService and the urgency formula) were deleted in manuscript
// revision Phase 1, step 7a.
@Module({
  imports: [NotificationsModule],
  providers: [
    BarangayService,
    OperationalPriorityService,
    MediaService,
    RateLimitService,
    HazardInformationService,
    RainfallContextService,
  ],
  exports: [
    BarangayService,
    OperationalPriorityService,
    MediaService,
    RateLimitService,
    HazardInformationService,
    RainfallContextService,
  ],
})
export class DomainModule {}
