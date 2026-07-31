import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { AdminSessionGuard } from '../common/guards/admin-session.guard';
import { CitizenSessionGuard } from '../common/guards/citizen-session.guard';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionService,
    AdminSessionGuard,
    CitizenSessionGuard,
  ],
  // SessionService and the guards are consumed by other feature modules
  // (AdminModule, ReportsModule, CronModule in later phases).
  exports: [SessionService, AdminSessionGuard, CitizenSessionGuard],
})
export class AuthModule {}
