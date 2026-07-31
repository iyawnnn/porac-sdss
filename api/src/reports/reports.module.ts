import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DomainModule } from '../domain/domain.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [AuthModule, DomainModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
