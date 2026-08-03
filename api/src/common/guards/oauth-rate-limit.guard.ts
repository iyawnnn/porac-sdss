import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

const WINDOW_MS = 60_000;
const LIMIT = 10;

// ponytail: in-memory per-IP sliding window, not the Postgres-backed
// rate_limit_events table — OAuth start/callback abuse doesn't need to
// survive a restart the way report-spam limiting does (see
// domain/ratelimit.service.ts's comment for that tradeoff). Upgrade to a
// shared store if this ever runs as more than one instance.
@Injectable()
export class OAuthRateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, number[]>();

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const ip = req.ip ?? 'unknown';
    const now = Date.now();

    const timestamps = (this.hits.get(ip) ?? []).filter(
      (t) => now - t < WINDOW_MS,
    );
    if (timestamps.length >= LIMIT) {
      throw new HttpException(
        'Too many OAuth attempts. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    timestamps.push(now);
    this.hits.set(ip, timestamps);
    return true;
  }
}
