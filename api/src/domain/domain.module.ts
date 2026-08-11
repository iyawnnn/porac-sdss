import { Module } from '@nestjs/common';
import { BarangayService } from './barangay.service';
import { ElevationService } from './elevation.service';
import { AppConfigService } from './app-config.service';
import { WeatherService } from './weather.service';
import { RecomputeService } from './recompute.service';
import { MediaService } from './media.service';
import { RateLimitService } from './ratelimit.service';
import { EscalationService } from './escalation.service';
import { NotificationsModule } from '../notifications/notifications.module';

// No controllers — feature modules (auth, reports, admin, cron) import
// this and build their own routes around these services.
@Module({
  imports: [NotificationsModule],
  providers: [
    BarangayService,
    ElevationService,
    AppConfigService,
    WeatherService,
    RecomputeService,
    MediaService,
    RateLimitService,
    EscalationService,
  ],
  exports: [
    BarangayService,
    ElevationService,
    AppConfigService,
    WeatherService,
    RecomputeService,
    MediaService,
    RateLimitService,
    EscalationService,
  ],
})
export class DomainModule {}
