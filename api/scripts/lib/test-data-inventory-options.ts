export class InventoryError extends Error {}

export interface InventoryOptions {
  target: 'local' | 'copy' | 'production';
  from: string | null;
  to: string | null;
}

const usage =
  'Inventory requires --target local|copy|production and either --all-dates or --from <ISO> --to <ISO>. Production also requires --confirm-production-read-only. No mutation mode exists.';

export function inventoryOptions(args: readonly string[]): InventoryOptions {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  const acceptedFlags = new Set([
    '--all-dates',
    '--confirm-production-read-only',
  ]);
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === '--') continue;
    if (values.has(key) || flags.has(key)) throw new InventoryError(usage);
    if (acceptedFlags.has(key)) flags.add(key);
    else if (['--target', '--from', '--to'].includes(key)) {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new InventoryError(usage);
      values.set(key, value);
    } else throw new InventoryError(usage);
  }
  const target = values.get('--target');
  if (!['local', 'copy', 'production'].includes(target ?? ''))
    throw new InventoryError(usage);
  if ((target === 'production') !== flags.has('--confirm-production-read-only'))
    throw new InventoryError(usage);
  const from = values.get('--from'),
    to = values.get('--to');
  if (flags.has('--all-dates')) {
    if (from || to) throw new InventoryError(usage);
  } else if (!from || !to) throw new InventoryError(usage);
  function timestamp(value: string | undefined) {
    if (!value) return null;
    if (
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(
        value,
      )
    )
      throw new InventoryError(usage);
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) throw new InventoryError(usage);
    if (
      Number(value.slice(11, 13)) > 23 ||
      Number(value.slice(14, 16)) > 59 ||
      Number(value.slice(17, 19)) > 59
    )
      throw new InventoryError(usage);
    // Reject normalized impossible calendar dates too.
    const calendar = value.slice(0, 10);
    const calendarDate = new Date(calendar + 'T00:00:00Z');
    if (calendarDate.toISOString().slice(0, 10) !== calendar)
      throw new InventoryError(usage);
    return date.toISOString();
  }
  const start = timestamp(from),
    end = timestamp(to);
  if (start && end && start >= end) throw new InventoryError(usage);
  return { target: target as InventoryOptions['target'], from: start, to: end };
}

// Pure validation runs before constructing a client. Never include the URL in errors.
export function inventoryTarget(
  databaseUrl: string | undefined,
  options: InventoryOptions,
) {
  const failure =
    'Inventory refused: explicit target does not match a single-host PostgreSQL URL.';
  let url: URL;
  try {
    url = new URL(databaseUrl ?? '');
  } catch {
    throw new InventoryError(failure);
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/i.test(url.hostname) ||
    [...url.searchParams.keys()].some(
      (key) => !['sslmode', 'channel_binding'].includes(key),
    )
  )
    throw new InventoryError(failure);
  const host = url.hostname.toLowerCase();
  const production = /^ep-steep-mouse(?:-|\.)/.test(host);
  const copy = /^ep-noisy-leaf(?:-|\.)/.test(host);
  const local = ['localhost', '127.0.0.1'].includes(host);
  if (
    (options.target === 'production' && !production) ||
    (options.target === 'copy' && !copy) ||
    (options.target === 'local' && !local) ||
    ((production || copy) && url.pathname !== '/neondb')
  )
    throw new InventoryError(failure);
  return options.target === 'production'
    ? 'ep-steep-mouse'
    : options.target === 'copy'
      ? 'ep-noisy-leaf'
      : 'loopback';
}

export function inventoryFailure(error: unknown) {
  // Neither SQL error detail nor filesystem/connection arguments are printed.
  if (error instanceof InventoryError) return error.message;
  return 'Inventory failed; no complete report was written. Check target, schema, permissions and row/time limits. No database change was requested.';
}
