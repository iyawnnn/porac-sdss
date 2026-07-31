import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  CITIZEN_SESSION_COOKIE,
  SessionService,
  type CitizenSession,
} from '../../auth/session.service';

export interface RequestWithCitizen extends Request {
  citizenSession?: CitizenSession;
}

@Injectable()
export class CitizenSessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithCitizen>();
    const token = req.cookies?.[CITIZEN_SESSION_COOKIE] as string | undefined;
    const session = token
      ? await this.sessions.verifyCitizenSession(token)
      : null;
    if (!session) throw new UnauthorizedException();
    req.citizenSession = session;
    return true;
  }
}
