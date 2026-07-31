import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  SESSION_COOKIE,
  SessionService,
  type AdminSession,
} from '../../auth/session.service';

export interface RequestWithAdmin extends Request {
  adminSession?: AdminSession;
}

@Injectable()
export class AdminSessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithAdmin>();
    const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
    const session = token
      ? await this.sessions.verifyAdminSession(token)
      : null;
    if (!session) throw new UnauthorizedException();
    req.adminSession = session;
    return true;
  }
}
