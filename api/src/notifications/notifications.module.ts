import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import {
  CitizenNotificationsController,
  NotificationsController,
} from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [AuthModule],
  controllers: [NotificationsController, CitizenNotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
