import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import type { Env } from './config/env';
import { trustProxyHops } from './common/utils/client-ip';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService<Env, true>);

  app.use(cookieParser());
  const hops = config.get('TRUST_PROXY_HOPS', { infer: true });
  app.set('trust proxy', trustProxyHops(hops));
  // Fails closed, but behind a real edge every client would share one
  // rate-limit bucket — say so instead of degrading silently.
  if (hops === 0 && config.get('NODE_ENV', { infer: true }) === 'production')
    new Logger('Bootstrap').warn(
      'TRUST_PROXY_HOPS=0: all clients share one IP rate-limit bucket. Set it to the edge proxy count (docs/deployment-readiness.md).',
    );
  app.enableShutdownHooks();

  // Explicit IPv4 bind — Node 18+ prefers IPv6 when resolving 'localhost',
  // so an implicit/dual-stack bind can still leave a caller connecting via
  // ::1 racing an interface that isn't actually listening on it.
  await app.listen(config.get('PORT', { infer: true }), '0.0.0.0');
}
void bootstrap();
