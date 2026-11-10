import { Controller, Get, Module } from '@nestjs/common';
import { DiscoveryModule, DiscoveryService } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Row = {
  key: string;
  controller: string;
  handler: string;
  guards: string[];
  execution: string;
  expected: Record<string, string>;
  conditions: string[];
};
type Policy = { version: number; actors: string[]; routes: Row[] };
type Catalog = {
  validatePolicy: (p: Policy) => void;
  discoverRoutes: (d: DiscoveryService) => Row[];
  assertCatalog: (p: Policy, r: Row[], g?: unknown[]) => void;
  assertConditionCoverage: (p: Policy, e: Set<string>) => void;
};
const load = createRequire(__filename);
const catalog = load(
  '../../../test/helpers/permission-route-catalog.cjs',
) as Catalog;
const policy = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../../test/permissions/route-policy.json'),
    'utf8',
  ),
) as Policy;
const copy = (): Policy => JSON.parse(JSON.stringify(policy)) as Policy;

@Controller('catalog-fixture')
class CatalogFixture {
  @Get() get() {
    return true;
  }
}
@Controller('newly-registered')
class NewController {
  @Get() get() {
    return true;
  }
}
@Module({ controllers: [NewController] })
class NewFeatureModule {}
function fixturePolicy(): Policy {
  return {
    version: 1,
    actors: [...policy.actors],
    routes: [
      {
        key: 'GET /catalog-fixture',
        controller: 'CatalogFixture',
        handler: 'get',
        guards: [],
        execution: 'probe',
        expected: Object.fromEntries(policy.actors.map((a) => [a, 'PUBLIC'])),
        conditions: [],
      },
    ],
  };
}

describe('independent permission policy and discovery failure gates', () => {
  it('classifies every checked-in row for all six identities', () => {
    expect(() => catalog.validatePolicy(policy)).not.toThrow();
    expect(policy.routes).toHaveLength(94);
    expect(
      policy.routes.reduce((n, r) => n + Object.keys(r.expected).length, 0),
    ).toBe(564);
  });
  it('finds a new registered controller through the Nest module graph', async () => {
    const module = await Test.createTestingModule({
      imports: [DiscoveryModule, NewFeatureModule],
      controllers: [CatalogFixture],
    }).compile();
    try {
      const routes = catalog.discoverRoutes(module.get(DiscoveryService));
      expect(routes.map((r) => r.key).sort()).toEqual([
        'GET /catalog-fixture',
        'GET /newly-registered',
      ]);
      expect(() => catalog.assertCatalog(fixturePolicy(), routes)).toThrow(
        'Registered routes',
      );
    } finally {
      await module.close();
    }
  });
  it.each([
    'missing',
    'extra',
    'method',
    'path',
    'duplicate',
    'guard',
    'handler',
  ])('detects a %s catalog mutation', (mutation) => {
    const actual = copy().routes;
    if (mutation === 'missing') actual.pop();
    if (mutation === 'extra')
      actual.push({ ...actual[0], key: 'GET /unclassified-new-route' });
    if (mutation === 'method') actual[0].key = 'DELETE /admin/account/password';
    if (mutation === 'path') actual[0].key += '/changed';
    if (mutation === 'duplicate') actual.push({ ...actual[0] });
    if (mutation === 'guard') actual[0].guards = [];
    if (mutation === 'handler') actual[0].handler += 'Changed';
    expect(() => catalog.assertCatalog(policy, actual)).toThrow();
  });
  it('rejects a new global guard until its policy is reviewed', () => {
    expect(() => catalog.assertCatalog(policy, policy.routes, [{}])).toThrow(
      'global guard',
    );
  });
  it.each([
    'identity',
    'outcome',
    'guard',
    'condition',
    'execution',
    'duplicate',
  ])('rejects an unclassified %s in the checked-in policy', (mutation) => {
    const p = copy();
    if (mutation === 'identity') delete p.routes[0].expected.citizen;
    if (mutation === 'outcome') p.routes[0].expected.citizen = 'IGNORE';
    if (mutation === 'guard') p.routes[0].guards.push('NewUnclassifiedGuard');
    if (mutation === 'condition')
      p.routes[0].conditions.push('unclassified-condition');
    if (mutation === 'execution') p.routes[0].execution = 'skip';
    if (mutation === 'duplicate') p.routes.push({ ...p.routes[0] });
    expect(() => catalog.validatePolicy(p)).toThrow();
  });
  it('cannot turn inline session handlers into admission-only probes', () => {
    const p = copy();
    p.routes.find((r) => r.key === 'GET /auth/me')!.execution = 'probe';
    expect(() => catalog.validatePolicy(p)).toThrow('Inline auth must execute');
  });
  it('fails if a declared conditional boundary was not exercised', () => {
    expect(() => catalog.assertConditionCoverage(policy, new Set())).toThrow(
      'Conditional permission coverage',
    );
    expect(() =>
      catalog.assertConditionCoverage(
        policy,
        new Set(policy.routes.flatMap((r) => r.conditions)),
      ),
    ).not.toThrow();
  });
});
