import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { OAuthStateService } from './oauth-state.service';
import { OAuthController } from './oauth/oauth.controller';
import { OAuthService } from './oauth/oauth.service';
import { GoogleOAuthProvider } from './oauth/google-oauth.provider';
import { FacebookOAuthProvider } from './oauth/facebook-oauth.provider';
import { OAuthRateLimitGuard } from '../common/guards/oauth-rate-limit.guard';
import { AdminSessionGuard } from '../common/guards/admin-session.guard';
import { CitizenSessionGuard } from '../common/guards/citizen-session.guard';
import { RecentReauthGuard } from '../common/guards/recent-reauth.guard';

@Module({
  controllers: [AuthController, OAuthController],
  providers: [
    AuthService,
    SessionService,
    OAuthStateService,
    OAuthService,
    GoogleOAuthProvider,
    FacebookOAuthProvider,
    OAuthRateLimitGuard,
    AdminSessionGuard,
    CitizenSessionGuard,
    RecentReauthGuard,
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
    FacebookOAuthProvider,
  ],
})
export class AuthModule {}
