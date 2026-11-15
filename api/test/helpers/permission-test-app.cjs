// This file is loaded only by the in-memory permission harness, never AppModule.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { of } = require('rxjs');

const SECRET = 'offline-permission-tests-only-secret-at-least-32-bytes';
const CRON_SECRET = 'offline-permission-cron-only';
const PROBE_HEADER = 'permission-admission-only';

function isolateEnvironment() {
  const cwd = process.cwd(),
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'porac-permission-app-'));
  const previous = { ...process.env };
  for (const name of Object.keys(process.env)) {
    if (
      /DATABASE|SECRET|TOKEN|API_KEY|CLOUDINARY|GOOGLE|EMAIL_FROM|WEB_ORIGIN|JWT|RAINFALL|HAZARD_INFORMATION/.test(
        name,
      )
    )
      delete process.env[name];
  }
  Object.assign(process.env, {
    NODE_ENV: 'test',
    JWT_SECRET: SECRET,
    CRON_SECRET,
    CLOUDINARY_URL: 'cloudinary://offline:offline@fixture',
    OPENWEATHERMAP_API_KEY: 'offline-unused',
    WEB_ORIGIN: 'http://web.fixture.invalid',
    GOOGLE_CLIENT_ID: 'offline-unused',
    GOOGLE_CLIENT_SECRET: 'offline-unused',
    GOOGLE_REDIRECT_URI: 'http://web.fixture.invalid/auth/google/callback',
    OAUTH_STATE_SECRET: SECRET,
    RAINFALL_LOOKUPS: 'disabled',
    HAZARD_INFORMATION_LOOKUPS: 'disabled',
  });
  process.chdir(scratch);
  const read = fs.readFileSync;
  fs.readFileSync = function (file, ...args) {
    assert(
      !(
        typeof file === 'string' && /^\.env(?:\.|$)/i.test(path.basename(file))
      ),
      'Permission tests must not read an env file',
    );
    return read.call(this, file, ...args);
  };
  // Permit only the explicitly owned, in-memory SQL/HTTP loopback sockets.
  const allowedPorts = new Set(),
    connect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (...args) {
    const opts = args[0];
    const first = Array.isArray(opts) ? opts[0] : opts;
    const port = Number(typeof first === 'object' ? first.port : first);
    const host = typeof first === 'object' ? first.host : args[1];
    assert(
      ['127.0.0.1', '::1', 'localhost'].includes(host) &&
        allowedPorts.has(port),
      'Unapproved network connection in permission tests',
    );
    return connect.apply(this, args);
  };
  const fetch = global.fetch;
  global.fetch = async () => {
    throw Error('Live provider fetch forbidden in permission tests');
  };
  return {
    allowedPorts,
    scratch,
    restore() {
      fs.readFileSync = read;
      net.Socket.prototype.connect = connect;
      global.fetch = fetch;
      process.chdir(cwd);
      for (const name of Object.keys(process.env))
        if (!(name in previous)) delete process.env[name];
      Object.assign(process.env, previous);
      // Empty cwd only: never recursively remove a computed directory. A
      // Windows loader may briefly retain a handle; don't mask a test error.
      assert.equal(path.dirname(scratch), path.resolve(os.tmpdir()));
      try {
        fs.rmdirSync(scratch);
      } catch (error) {
        if (!['EPERM', 'EBUSY', 'ENOTEMPTY'].includes(error.code)) throw error;
      }
    },
  };
}

async function createPermissionApp(pg, db, policy) {
  const { Test } = require('@nestjs/testing');
  const { DiscoveryModule, DiscoveryService } = require('@nestjs/core');
  const { AppModule } = require('../../src/app.module.ts');
  const { PG, DB } = require('../../src/db/db.module.ts');
  const { EMAIL_SERVICE } = require('../../src/citizens/email.service.ts');
  const {
    GoogleOAuthProvider,
  } = require('../../src/auth/oauth/google-oauth.provider.ts');
  const { MediaService } = require('../../src/domain/media.service.ts');
  const cookieParser = require('cookie-parser');
  const {
    discoverRoutes,
    assertCatalog,
  } = require('./permission-route-catalog.cjs');
  const deliveries = [],
    profiles = new Map();
  const email = Object.fromEntries(
    [
      'sendPasswordReset',
      'sendOAuthOnlyNotice',
      'sendPasswordResetConfirmation',
      'sendReportResolved',
      'sendReportRejected',
    ].map((name) => [
      name,
      async (...args) => {
        deliveries.push({ name, args });
      },
    ]),
  );
  const provider = {
    authorizeUrl: (state) =>
      'https://provider.fixture.invalid/authorize?state=' +
      encodeURIComponent(state),
    resolveProfile: async (code) => {
      assert(profiles.has(code), 'Unregistered offline OAuth profile');
      return profiles.get(code);
    },
  };
  const module = await Test.createTestingModule({
    imports: [AppModule, DiscoveryModule],
  })
    .overrideProvider(PG)
    .useValue(pg)
    .overrideProvider(DB)
    .useValue(db)
    .overrideProvider(EMAIL_SERVICE)
    .useValue(email)
    .overrideProvider(GoogleOAuthProvider)
    .useValue(provider)
    .overrideProvider(MediaService)
    .useValue({
      upload: async () => {
        throw Error('Unexpected image upload');
      },
    })
    .compile();
  const app = module.createNestApplication({ logger: false });
  // Production trust rule; supertest plays one appending edge proxy.
  const { trustProxyHops } = require('../../src/common/utils/client-ip.ts');
  app.getHttpAdapter().getInstance().set('trust proxy', trustProxyHops(1));
  app.use(cookieParser());
  const routes = discoverRoutes(module.get(DiscoveryService));
  assertCatalog(policy, routes, app.config.getGlobalGuards());
  const policies = new Map(
    routes.map((route) => [
      route.handlerRef,
      policy.routes.find((row) => row.key === route.key),
    ]),
  );
  app.useGlobalInterceptors({
    intercept(context, next) {
      const req = context.switchToHttp().getRequest(),
        res = context.switchToHttp().getResponse();
      const row = policies.get(context.getHandler());
      assert(row, 'Uncatalogued handler reached the test app');
      if (
        req.headers['x-permission-probe'] === PROBE_HEADER &&
        row.execution === 'probe'
      ) {
        // Runs after all real guards. It proves admission only: no pipes,
        // business method, cron job, upload or password action is executed.
        res.status(200);
        return of({
          permissionProbe: row.key,
          admin: req.adminSession?.adminId ?? null,
          citizen: req.citizenSession?.citizenId ?? null,
        });
      }
      return next.handle();
    },
  });
  await app.init();
  assertCatalog(policy, discoverRoutes(module.get(DiscoveryService)), [
    ...app.config.getGlobalGuards(),
    ...app.config.getGlobalRequestGuards(),
  ]);
  return { app, module, routes, deliveries, profiles };
}

module.exports = {
  isolateEnvironment,
  createPermissionApp,
  SECRET,
  CRON_SECRET,
  PROBE_HEADER,
};
