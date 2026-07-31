import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { Env } from '../../config/env';

// CRON_SECRET is an env var (validated at boot in config/env.ts), so this
// reads it via @nestjs/config's ConfigService — not AppConfigService, which
// is the DB-backed `config` table reader (elev_min/max, weather cache) and
// has no access to process env at all.
@Injectable()
export class CronSecretGuard implements CanActivate {
  constructor(private readonly config: ConfigService<Env, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const expected = this.config.get('CRON_SECRET', { infer: true });

    const authHeader = req.headers['authorization'];
    const bearerToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : undefined;

    const rawHeaderSecret = req.headers['x-cron-secret'];
    const headerSecret = Array.isArray(rawHeaderSecret)
      ? rawHeaderSecret[0]
      : rawHeaderSecret;

    const provided = bearerToken ?? headerSecret;

    if (!provided || provided !== expected) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
