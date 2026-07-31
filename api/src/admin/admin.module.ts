import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DomainModule } from '../domain/domain.module';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { BarangaysGeoService } from './barangays-geo.service';

// Three controllers sharing one module — they share nothing else, but
// splitting into three modules buys nothing (see blueprint §1). Each
// controller carries @UseGuards(AdminSessionGuard) (not an APP_GUARD
// provider, which would leak the guard onto every module app-wide) —
// closes the previously unguarded tickets/geo and barangays/geo routes,
// which relied entirely on proxy.ts's matcher.
@Module({
  imports: [AuthModule, DomainModule],
  controllers: [TicketsController, ModerationController, DashboardController],
  providers: [TicketsService, ModerationService, DashboardService, BarangaysGeoService],
})
export class AdminModule {}
