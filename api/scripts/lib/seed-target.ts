export const NON_PRODUCTION_FLAG = '--i-know-this-is-not-production';

// Pure: never reads an env file, opens a connection, or includes the URL in errors.
// Require a single explicit host: no PGHOST fallback, sockets or multi-host URLs.
export function assertSeedTarget(
  databaseUrl: string | undefined,
  args: readonly string[] = [],
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
    throw new Error(
      'Seed refused: production host ep-steep-mouse is never allowed.',
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
