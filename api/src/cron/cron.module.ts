import { Module } from '@nestjs/common';
import { DomainModule } from '../domain/domain.module';
import { CronController } from './cron.controller';
import { CronSecretGuard } from '../common/guards/cron-secret.guard';

@Module({
  imports: [DomainModule],
  controllers: [CronController],
  providers: [CronSecretGuard],
})
export class CronModule {}
