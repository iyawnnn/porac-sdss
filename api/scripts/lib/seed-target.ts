export const NON_PRODUCTION_FLAG = '--i-know-this-is-not-production';
// The ep-steep-mouse database is the project's development/E2E database and holds
// only synthetic data (docs/testing.md). Seeding it needs this explicit opt-in,
// set to the exact endpoint label, so a stray or default run is still refused.
export const DEV_DB_OVERRIDE_ENV = 'PORAC_ALLOW_SEED_ON_DEV_DB';

// Pure: never reads an env file, opens a connection, or includes the URL in errors.
// Require a single explicit host: no PGHOST fallback, sockets or multi-host URLs.
export function assertSeedTarget(
  databaseUrl: string | undefined,
  args: readonly string[] = [],
  env: Readonly<Record<string, string | undefined>> = process.env,
): void {
  let url: URL;
  try {
    url = new URL(databaseUrl ?? '');
  } catch {
    throw new Error(
      'Seed refused: DATABASE_URL must be a valid PostgreSQL URL.',
    );
  }
  const host = url.hostname.toLowerCase();
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(host)
  ) {
    throw new Error(
      'Seed refused: use a PostgreSQL URL with one explicit host.',
    );
  }
  const label = host.split('.')[0];
  if (/^ep-steep-mouse(?:-|$)/.test(label)) {
    if (env[DEV_DB_OVERRIDE_ENV] === 'ep-steep-mouse') return;
    throw new Error(
      'Seed refused: host ep-steep-mouse (the production-labelled development database) ' +
        'requires ' +
        DEV_DB_OVERRIDE_ENV +
        '=ep-steep-mouse.',
    );
  }
  if (
    /^ep-noisy-leaf(?:-|$)/.test(label) ||
    host === 'localhost' ||
    host === '127.0.0.1'
  ) {
    return;
  }
  if (!args.includes(NON_PRODUCTION_FLAG)) {
    throw new Error(
      'Seed refused: target is not allow-listed; a disposable target requires ' +
        NON_PRODUCTION_FLAG +
        '.',
    );
  }
}

export function seedArguments(args: readonly string[]): string[] {
  // pnpm may forward a literal separator. Do not let the guard flag shift CLI fields.
  return args.filter((arg) => arg !== '--' && arg !== NON_PRODUCTION_FLAG);
}
