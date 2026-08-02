import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import {
  CITIZEN_REAUTH_COOKIE,
  SessionService,
} from '../../auth/session.service';
import type { RequestWithCitizen } from './citizen-session.guard';

// Gates unlink / first-time password setup — must run alongside
// CitizenSessionGuard (which populates req.citizenSession) on the same
// route. Requires a short-lived reauth cookie issued moments ago, either
// from a fresh current-password check or a fresh provider round-trip
// (see citizens/account.controller.ts and auth/oauth/oauth.controller.ts).
@Injectable()
export class RecentReauthGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithCitizen>();
    const token = req.cookies?.[CITIZEN_REAUTH_COOKIE] as string | undefined;
    const reauth = token ? await this.sessions.verifyReauth(token) : null;
    if (!reauth || reauth.citizenId !== req.citizenSession?.citizenId) {
      throw new HttpException(
        'Recent reauthentication required.',
        HttpStatus.PRECONDITION_REQUIRED,
      );
    }
    return true;
  }
}
