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
import { AdminAuditController } from './admin-audit.controller';
import { AdminAuditService } from './admin-audit.service';
import { AdminAccountController } from './admin-account.controller';
import { AdminAccountService } from './admin-account.service';
import { WorkOrdersController } from './work-orders.controller';
import { WorkOrdersService } from './work-orders.service';
import { AdminDirectoryController } from './admin-directory.controller';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { BarangayInsightsController } from './barangay-insights.controller';
import { BarangayInsightsService } from './barangay-insights.service';

// Ten controllers sharing one module — they share nothing else, but
// splitting into separate modules buys nothing (see blueprint §1). Each
// controller carries its own @UseGuards(...) (not an APP_GUARD provider,
// which would leak the guard onto every module app-wide) — closes the
// previously unguarded tickets/geo and barangays/geo routes, which relied
// entirely on proxy.ts's matcher. AdminsController and AdminAuditController
// additionally stack SystemAdminGuard since account management and the
// activity log are both System Administrator only. AdminAccountController
// (own password change) and AdminDirectoryController (office-scoped admin
// list for Work Orders assignment) deliberately do not — the former because
// any logged-in admin owns their own credentials, the latter because MEO/
// MDRRMO need it too; it stays safe via resolveOfficeScope, not the guard.
// ReportsController is the same shape as AdminDirectoryController: no extra
// guard, safe because it reuses TicketsService/WorkOrdersService's own
// office-scoped query parsing rather than any new authorization logic.
// BarangayInsightsController is the same shape again — read-only aggregates
// over tickets/barangays/dem_points, office-scoped via resolveOfficeScope,
// no new authorization path.
@Module({
  imports: [AuthModule, DomainModule, NotificationsModule, CitizensModule],
  controllers: [
    TicketsController,
    ModerationController,
    DashboardController,
    AdminsController,
    AdminAuditController,
    AdminAccountController,
    WorkOrdersController,
    AdminDirectoryController,
    ReportsController,
    BarangayInsightsController,
  ],
  providers: [
    TicketsService,
    ModerationService,
    DashboardService,
    BarangaysGeoService,
    AdminsService,
    AdminAuditService,
    AdminAccountService,
    WorkOrdersService,
    ReportsService,
    BarangayInsightsService,
  ],
})
export class AdminModule {}
