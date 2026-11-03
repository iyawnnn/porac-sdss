import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReferenceLookupRateLimitGuard } from '../common/guards/reference-lookup-rate-limit.guard';
import { DomainModule } from '../domain/domain.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [AuthModule, DomainModule, NotificationsModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReferenceLookupRateLimitGuard],
})
export class ReportsModule {}
