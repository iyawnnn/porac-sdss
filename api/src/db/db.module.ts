import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import type { Env } from '../config/env';

export const PG = 'PG_CLIENT';
export const DB = 'DRIZZLE';

// NestJS is a long-lived process (unlike the Vercel-serverless Next app
// this replaces), so it owns its own connection pool — use Neon's
// direct/unpooled endpoint, not the -pooler one. Double-pooling through
// pgbouncer transaction mode breaks pg_advisory_xact_lock and prepared
// statements, which the reports-merge transaction (Phase 6) depends on.
@Global()
@Module({
  providers: [
    {
      provide: PG,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        postgres(config.get('DATABASE_URL', { infer: true }), { max: 10 }),
    },
    {
      provide: DB,
      inject: [PG],
      useFactory: (pg: Sql) => drizzle(pg),
    },
  ],
  exports: [PG, DB],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(PG) private readonly pg: Sql) {}

  onApplicationShutdown() {
    return this.pg.end({ timeout: 5 });
  }
}
