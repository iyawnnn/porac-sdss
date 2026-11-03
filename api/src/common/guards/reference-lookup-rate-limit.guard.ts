import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { RequestWithCitizen } from './citizen-session.guard';

export const REFERENCE_LOOKUP_WINDOW_MS = 60_000;
export const REFERENCE_LOOKUP_LIMIT = 30;

// A per-key sliding window: allow at most `limit` hits in any `windowMs`.
// Keys with no hit left in the window are dropped, so the map only holds
// recently active keys.
export class SlidingWindowCounter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  // Records the hit and returns true, or returns false (recording nothing)
  // when the key is already at the limit.
  hit(key: string, now: number): boolean {
    const recent = (this.hits.get(key) ?? []).filter(
      (t) => now - t < this.windowMs,
    );
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 1000) this.prune(now);
    return true;
  }

  private prune(now: number): void {
    for (const [key, times] of this.hits) {
      if (times.every((t) => now - t >= this.windowMs)) this.hits.delete(key);
    }
  }
}

// GET /reports/mine/by-reference/:ref (manuscript revision Phase 6, step
// 6b): 30 lookups a minute per citizen, so tracking references (sequential,
// PRC-YYYY-<report id>) cannot be enumerated through it. Runs after
// CitizenSessionGuard, which sets req.citizenSession. Same in-memory
// convention as OAuthRateLimitGuard: it does not need to survive a restart;
// upgrade to a shared store if the API ever runs as more than one instance.
@Injectable()
export class ReferenceLookupRateLimitGuard implements CanActivate {
  private readonly counter = new SlidingWindowCounter(
    REFERENCE_LOOKUP_LIMIT,
    REFERENCE_LOOKUP_WINDOW_MS,
  );

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RequestWithCitizen>();
    const key = `citizen:${req.citizenSession?.citizenId ?? 'unknown'}`;
    if (!this.counter.hit(key, Date.now())) {
      throw new HttpException(
        'Too many reference lookups. Try again in a minute.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
