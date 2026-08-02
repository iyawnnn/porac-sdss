import { Module } from '@nestjs/common';
import { DomainModule } from '../domain/domain.module';
import { CitizensModule } from '../citizens/citizens.module';
import { CronController } from './cron.controller';
import { CronSecretGuard } from '../common/guards/cron-secret.guard';

@Module({
  imports: [DomainModule, CitizensModule],
  controllers: [CronController],
  providers: [CronSecretGuard],
})
export class CronModule {}
