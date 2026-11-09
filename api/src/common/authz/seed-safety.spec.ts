import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import {
  assertSeedTarget,
  NON_PRODUCTION_FLAG,
} from '../../../scripts/lib/seed-target';
import { openSeedDatabase } from '../../../scripts/lib/seed-connection';
import { parseSeedAdminArguments } from '../../../scripts/lib/seed-admin-account';
import { assertAccountFields } from './admin-account-fields';

jest.mock('postgres', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('drizzle-orm/postgres-js', () => ({ drizzle: jest.fn() }));
const target = (host: string) =>
  'postgresql://test:private-test-value@' + host + '/fixture';

describe('seed host safety (no database connections)', () => {
  beforeEach(() => jest.clearAllMocks());
  it.each([
    'ep-steep-mouse.example',
    'ep-steep-mouse-123-pooler.example',
    'EP-STEEP-MOUSE-123.example',
  ])('never allows production host %s, even with confirmation', (host) => {
    for (const args of [[], [NON_PRODUCTION_FLAG]]) {
      expect(() => openSeedDatabase(target(host), args)).toThrow(
        /production host ep-steep-mouse/,
      );
    }
    expect(postgres).not.toHaveBeenCalled();
    expect(drizzle).not.toHaveBeenCalled();
  });
  it.each([
    'ep-noisy-leaf.example',
    'ep-noisy-leaf-123-pooler.example',
    'EP-NOISY-LEAF-123.example',
    'localhost',
    '127.0.0.1',
  ])('allows disposable/local host %s before creating a client', (host) => {
    openSeedDatabase(target(host), []);
    expect(postgres).toHaveBeenCalledWith(target(host));
    expect(drizzle).toHaveBeenCalledTimes(1);
  });
  it.each([
    'ep-other-copy.example',
    'ep-noisy-leafish.example',
    'localhost.example',
  ])('requires explicit confirmation for unlisted host %s', (host) => {
    expect(() => openSeedDatabase(target(host), [])).toThrow(
      /not allow-listed/,
    );
    expect(postgres).not.toHaveBeenCalled();
    expect(() =>
      assertSeedTarget(target(host), [NON_PRODUCTION_FLAG]),
    ).not.toThrow();
  });
  it.each([
    undefined,
    '',
    'invalid-private-test-value',
    'postgres:///fixture',
    'https://localhost/fixture',
    target('localhost,ep-steep-mouse.example'),
    target('ep-steep-mouse.example.'),
    target('localhost%2cep-steep-mouse.example'),
  ])(
    'fails closed for invalid or ambiguous target %# without leaking it',
    (url) => {
      try {
        openSeedDatabase(url, [NON_PRODUCTION_FLAG]);
        throw new Error('Guard did not reject');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        const message = (error as Error).message;
        expect(message).toMatch(/^Seed refused:/);
        for (const secret of [
          'private-test-value',
          'postgresql://',
          'https://',
        ])
          expect(message).not.toContain(secret);
      }
      expect(postgres).not.toHaveBeenCalled();
    },
  );
  it('does not read PGHOST when DATABASE_URL has no explicit host', () => {
    const previous = process.env.PGHOST;
    try {
      process.env.PGHOST = 'ep-steep-mouse.example';
      expect(() =>
        openSeedDatabase('postgres:///fixture', [NON_PRODUCTION_FLAG]),
      ).toThrow(/Seed refused:/);
      expect(postgres).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.PGHOST;
      else process.env.PGHOST = previous;
    }
  });
  it('routes every seed entrypoint through the guarded client; no direct DB constructors', () => {
    const seedDir = resolve(__dirname, '../../../scripts/seed');
    const files = readdirSync(seedDir).filter((file) => file.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = ts.createSourceFile(
        file,
        readFileSync(resolve(seedDir, file), 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      const imports = source.statements
        .filter(ts.isImportDeclaration)
        .map((node) => (node.moduleSpecifier as ts.StringLiteral).text);
      expect({ file, guarded: imports.includes('../lib/seed-db') }).toEqual({
        file,
        guarded: true,
      });
      expect(
        imports.some((name) =>
          ['../db', 'postgres', 'drizzle-orm/postgres-js'].includes(name),
        ),
      ).toBe(false);
    }
    expect(
      readFileSync(resolve(seedDir, '../lib/recompute.ts'), 'utf8'),
    ).not.toContain('../db');
    expect(readFileSync(resolve(seedDir, '../db.ts'), 'utf8')).not.toContain(
      'seed-',
    );
  });
});

describe('canonical admin seed CLI', () => {
  it.each([
    ['PERSONNEL', 'MEO', 'false'],
    ['PERSONNEL', 'MDRRMO', 'false'],
    ['PERSONNEL', 'MDRRMO', 'true'],
    ['SYSTEM_ADMIN', '-', 'false'],
  ])(
    'accepts %s / %s / %s and safely removes CLI control flags',
    (type, office, focal) => {
      const fields = parseSeedAdminArguments([
        '--',
        'staff@test.invalid',
        'test-only-password',
        type,
        office,
        focal,
        'First',
        'Last',
        NON_PRODUCTION_FLAG,
      ]);
      expect(fields).toMatchObject({
        accountType: type,
        office: office === '-' ? null : office,
        isFocal: focal === 'true',
        firstName: 'First',
        lastName: 'Last',
      });
    },
  );
  it.each([
    ['PERSONNEL', '-', 'false'],
    ['PERSONNEL', 'MEO', 'true'],
    ['SYSTEM_ADMIN', 'MEO', 'false'],
    ['SYSTEM_ADMIN', '-', 'true'],
    ['officer', 'MEO', 'false'],
    ['PERSONNEL', 'MEO', '1'],
  ])('rejects invalid tuple %s / %s / %s', (...tuple) => {
    expect(() =>
      parseSeedAdminArguments([
        'staff@test.invalid',
        'test-only-password',
        ...tuple,
      ]),
    ).toThrow();
  });
  it('has the same combination acceptance as the shared API validator', () => {
    for (const type of ['PERSONNEL', 'SYSTEM_ADMIN', 'supervisor']) {
      for (const office of ['MEO', 'MDRRMO', '-', 'OTHER']) {
        for (const focal of [true, false]) {
          let valid = true;
          try {
            assertAccountFields(type, focal, office === '-' ? null : office);
          } catch {
            valid = false;
          }
          const parse = () =>
            parseSeedAdminArguments([
              'staff@test.invalid',
              'test-only-password',
              type,
              office,
              String(focal),
            ]);
          if (valid) expect(parse).not.toThrow();
          else expect(parse).toThrow();
        }
      }
    }
  });
  it('rejects missing or extra arguments without echoing the supplied password', () => {
    for (const args of [
      [],
      ['staff@test.invalid', 'private-test-value'],
      [
        'staff@test.invalid',
        'private-test-value',
        'PERSONNEL',
        'MEO',
        'false',
        'First',
        'Last',
        'extra',
      ],
    ]) {
      expect(() => parseSeedAdminArguments(args)).toThrow(/^Usage:/);
      try {
        parseSeedAdminArguments(args);
      } catch (error) {
        expect((error as Error).message).not.toContain('private-test-value');
      }
    }
  });
});
