const assert = require('node:assert/strict');
const { RequestMethod } = require('@nestjs/common');
const {
  PATH_METADATA,
  METHOD_METADATA,
  GUARDS_METADATA,
} = require('@nestjs/common/constants');
const { MetadataScanner } = require('@nestjs/core/metadata-scanner');

const ACTORS = [
  'anonymous',
  'citizen',
  'meo',
  'mdrrmo',
  'focal',
  'systemAdmin',
];
const OUTCOMES = ['ADMIT', 'PUBLIC', 'REDIRECT', '200', '401', '403', '428'];
const GUARDS = [
  'AdminSessionGuard',
  'CitizenSessionGuard',
  'SystemAdminGuard',
  'OperationalStaffGuard',
  'PersonnelGuard',
  'FocalGuard',
  'CronSecretGuard',
  'RecentReauthGuard',
  'ReferenceLookupRateLimitGuard',
  'OAuthRateLimitGuard',
];
const CONDITIONS = [
  'cron-secret',
  'oauth-purpose',
  'oauth-rate',
  'notification-scope',
  'session-cookies',
  'public-credentials',
  'account-ownership',
  'recent-reauth',
  'public-map-privacy',
  'citizen-ownership',
  'reference-rate',
  'focal-grouping',
  'focal-correction',
  'foreign-writes',
  'focal-intake',
  'saved-view-ownership',
  'work-order-office',
  'ticket-office',
  'office-exports',
  'office-lists',
];

function validatePolicy(policy) {
  assert.equal(policy.version, 1);
  assert.deepEqual(
    policy.actors,
    ACTORS,
    'Every policy row needs all six identities',
  );
  assert(policy.routes.length > 0);
  const keys = new Set();
  for (const row of policy.routes) {
    assert(
      /^(GET|POST|PATCH|PUT|DELETE|HEAD|OPTIONS) \/\S*$/.test(row.key),
      'Invalid route key',
    );
    assert(!keys.has(row.key), 'Duplicate policy: ' + row.key);
    keys.add(row.key);
    assert(
      row.controller && row.handler,
      'Missing handler identity: ' + row.key,
    );
    assert(
      ['handler', 'probe'].includes(row.execution),
      'Unclassified execution: ' + row.key,
    );
    assert.deepEqual(Object.keys(row.expected).sort(), [...ACTORS].sort());
    assert(
      Object.values(row.expected).every((v) => OUTCOMES.includes(v)),
      'Unclassified outcome: ' + row.key,
    );
    assert(
      Array.isArray(row.guards) && row.guards.every((g) => GUARDS.includes(g)),
      'Unclassified guard: ' + row.key,
    );
    assert(
      Array.isArray(row.conditions) &&
        row.conditions.every((c) => CONDITIONS.includes(c)),
      'Unclassified condition: ' + row.key,
    );
    if (row.guards.length === 0 || row.guards.includes('OAuthRateLimitGuard')) {
      // Inline authentication must never be accidentally short-circuited.
      const inline =
        row.key === 'GET /auth/me' ||
        row.key.startsWith('GET /notifications') ||
        row.key.startsWith('POST /notifications') ||
        row.key.includes('/logout') ||
        row.key.startsWith('GET /auth/google');
      if (inline)
        assert.equal(
          row.execution,
          'handler',
          'Inline auth must execute: ' + row.key,
        );
    }
  }
  return policy;
}

function discoverRoutes(discovery) {
  const scanner = new MetadataScanner(),
    routes = [];
  const paths = (v) => (Array.isArray(v) ? v : [v ?? '']);
  // DiscoveryService uses the real compiled module graph, including newly
  // registered controllers. No controller allowlist or filename convention.
  for (const wrapper of discovery.getControllers()) {
    const type = wrapper.metatype,
      prototype = type?.prototype;
    assert(prototype, 'Uninspectable registered controller');
    for (const name of scanner.getAllMethodNames(prototype)) {
      const handler = prototype[name],
        method = Reflect.getMetadata(METHOD_METADATA, handler);
      if (method === undefined) continue;
      for (const base of paths(Reflect.getMetadata(PATH_METADATA, type))) {
        for (const tail of paths(Reflect.getMetadata(PATH_METADATA, handler))) {
          const url =
            '/' +
            [base, tail]
              .flatMap((p) => p.split('/'))
              .filter(Boolean)
              .join('/');
          routes.push({
            key: RequestMethod[method] + ' ' + url,
            controller: type.name,
            handler: name,
            handlerRef: handler,
            controllerRef: type,
            guards: [
              ...(Reflect.getMetadata(GUARDS_METADATA, type) ?? []),
              ...(Reflect.getMetadata(GUARDS_METADATA, handler) ?? []),
            ].map((g) => g.name),
          });
        }
      }
    }
  }
  return routes;
}

function assertCatalog(policy, routes, globalGuards = []) {
  validatePolicy(policy);
  assert.equal(
    globalGuards.length,
    0,
    'New global guard needs an explicit policy review',
  );
  const actual = new Map();
  for (const route of routes) {
    assert(!actual.has(route.key), 'Duplicate registered route: ' + route.key);
    actual.set(route.key, route);
  }
  assert.deepEqual(
    [...actual.keys()].sort(),
    policy.routes.map((r) => r.key).sort(),
    'Registered routes and independent policy differ',
  );
  for (const row of policy.routes) {
    const route = actual.get(row.key);
    assert.equal(route.controller, row.controller, row.key);
    assert.equal(route.handler, row.handler, row.key);
    assert.deepEqual(
      route.guards,
      row.guards,
      'Guard wiring changed: ' + row.key,
    );
  }
}

function assertConditionCoverage(policy, executed) {
  const required = [...new Set(policy.routes.flatMap((r) => r.conditions))];
  assert.deepEqual(
    required.filter((c) => !executed.has(c)),
    [],
    'Conditional permission coverage missing',
  );
}

module.exports = {
  ACTORS,
  validatePolicy,
  discoverRoutes,
  assertCatalog,
  assertConditionCoverage,
};
