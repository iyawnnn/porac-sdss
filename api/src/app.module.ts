import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DbModule } from './db/db.module';
import { DomainModule } from './domain/domain.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { ReportsModule } from './reports/reports.module';
import { CitizensModule } from './citizens/citizens.module';
import { NotificationsModule } from './notifications/notifications.module';
import { CronModule } from './cron/cron.module';
import { validate } from './config/env';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate }),
    DbModule,
    DomainModule,
    AuthModule,
    AdminModule,
    ReportsModule,
    CitizensModule,
    NotificationsModule,
    CronModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
