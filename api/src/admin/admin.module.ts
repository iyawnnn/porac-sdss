import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DomainModule } from '../domain/domain.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CitizensModule } from '../citizens/citizens.module';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { BarangaysGeoService } from './barangays-geo.service';
import { AdminsController } from './admins.controller';
import { AdminsService } from './admins.service';

// Four controllers sharing one module — they share nothing else, but
// splitting into separate modules buys nothing (see blueprint §1). Each
// controller carries its own @UseGuards(...) (not an APP_GUARD provider,
// which would leak the guard onto every module app-wide) — closes the
// previously unguarded tickets/geo and barangays/geo routes, which relied
// entirely on proxy.ts's matcher. AdminsController additionally stacks
// SystemAdminGuard since account management is System Administrator only.
@Module({
  imports: [AuthModule, DomainModule, NotificationsModule, CitizensModule],
  controllers: [
    TicketsController,
    ModerationController,
    DashboardController,
    AdminsController,
  ],
  providers: [
    TicketsService,
    ModerationService,
    DashboardService,
    BarangaysGeoService,
    AdminsService,
  ],
})
export class AdminModule {}
