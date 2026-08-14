import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { OAuthStateService } from './oauth-state.service';
import { OAuthController } from './oauth/oauth.controller';
import { OAuthService } from './oauth/oauth.service';
import { GoogleOAuthProvider } from './oauth/google-oauth.provider';
import { OAuthRateLimitGuard } from '../common/guards/oauth-rate-limit.guard';
import { AdminSessionGuard } from '../common/guards/admin-session.guard';
import { CitizenSessionGuard } from '../common/guards/citizen-session.guard';
import { RecentReauthGuard } from '../common/guards/recent-reauth.guard';
import { RateLimitService } from '../domain/ratelimit.service';
import { AdminAuditService } from '../admin/admin-audit.service';

@Module({
  controllers: [AuthController, OAuthController],
  providers: [
    AuthService,
    SessionService,
    OAuthStateService,
    OAuthService,
    GoogleOAuthProvider,
    OAuthRateLimitGuard,
    AdminSessionGuard,
    CitizenSessionGuard,
    RecentReauthGuard,
    // Provided directly rather than via DomainModule — DomainModule imports
    // NotificationsModule, which imports AuthModule, so importing
    // DomainModule here creates a circular module dependency. RateLimitService
    // only needs the globally-provided PG client (DbModule is @Global()), so
    // this standalone provider resolves fine without pulling in that cycle.
    RateLimitService,
    // Same reasoning as RateLimitService above: AdminModule imports
    // AuthModule, so importing AdminModule back here would be circular.
    // AdminAuditService only needs the globally-provided DB client, so a
    // standalone provider resolves fine. Used by AuthService.adminLogin for
    // admin_login/admin_login_failed (Issue #49).
    AdminAuditService,
  ],
  // SessionService and the guards are consumed by other feature modules
  // (AdminModule, ReportsModule, CronModule in later phases; RecentReauthGuard
  // by the new CitizensModule's account controller).
  exports: [
    SessionService,
    AdminSessionGuard,
    CitizenSessionGuard,
    RecentReauthGuard,
    OAuthService,
    OAuthStateService,
    GoogleOAuthProvider,
  ],
})
export class AuthModule {}
