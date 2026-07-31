import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import type { Env } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService<Env, true>);

  app.use(cookieParser());
  // All traffic arrives via the Next.js rewrite proxy, one hop away —
  // trust its X-Forwarded-For so rate limiting (Phase 6) sees real client
  // IPs instead of the proxy's.
  app.set('trust proxy', 1);
  app.enableShutdownHooks();

  // Explicit IPv4 bind — Node 18+ prefers IPv6 when resolving 'localhost',
  // so an implicit/dual-stack bind can still leave a caller connecting via
  // ::1 racing an interface that isn't actually listening on it.
  await app.listen(config.get('PORT', { infer: true }), '0.0.0.0');
}
void bootstrap();
