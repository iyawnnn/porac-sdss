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

  await app.listen(config.get('PORT', { infer: true }));
}
void bootstrap();
