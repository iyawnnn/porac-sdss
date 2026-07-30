import { Module } from '@nestjs/common';
import { BarangayService } from './barangay.service';
import { ElevationService } from './elevation.service';
import { AppConfigService } from './app-config.service';
import { WeatherService } from './weather.service';
import { RecomputeService } from './recompute.service';
import { MediaService } from './media.service';
import { RateLimitService } from './ratelimit.service';

// No controllers — feature modules (auth, reports, admin, cron) import
// this and build their own routes around these services.
@Module({
  providers: [
    BarangayService,
    ElevationService,
    AppConfigService,
    WeatherService,
    RecomputeService,
    MediaService,
    RateLimitService,
  ],
  exports: [
    BarangayService,
    ElevationService,
    AppConfigService,
    WeatherService,
    RecomputeService,
    MediaService,
    RateLimitService,
  ],
})
export class DomainModule {}
