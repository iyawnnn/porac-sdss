import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

// Phase 7, step 7.0. CSV formula-injection neutralisation lives once, in
// the central writer (csv.ts). This scan fails if a second, hand-built CSV
// path appears anywhere in the app or its scripts — it would skip that
// neutralisation (and the quoting rules) without anyone noticing. Add a new
// export by calling toCsv from ReportsService, never by building CSV text.

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const SCANNED_DIRS = [
  'api/src',
  'api/scripts',
  'app',
  'components',
  'lib',
  'scripts',
];
const SCANNED_ROOT_FILES = ['proxy.ts', 'next.config.ts'];

const CSV_WRITER = 'api/src/common/utils/csv.ts';
const CSV_CONTROLLER = 'api/src/admin/reports.controller.ts';
const CSV_SERVICE = 'api/src/admin/reports.service.ts';

function sourceFiles(dir: string): string[] {
  const full = join(REPO_ROOT, dir);
  let entries: string[];
  try {
    entries = readdirSync(full);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    if (name === 'node_modules' || name === 'dist' || name === '.next')
      return [];
    const path = join(full, name);
    if (statSync(path).isDirectory()) return sourceFiles(join(dir, name));
    if (!/\.(ts|tsx|js|mjs|cjs)$/.test(name)) return [];
    // Tests may build CSV text to compare against; only shipped code counts.
    if (/\.spec\.(ts|tsx)$/.test(name) || /\.e2e-spec\.ts$/.test(name))
      return [];
    return [path];
  });
}

const files = [
  ...SCANNED_DIRS.flatMap(sourceFiles),
  ...SCANNED_ROOT_FILES.map((f) => join(REPO_ROOT, f)).filter((f) => {
    try {
      return statSync(f).isFile();
    } catch {
      return false;
    }
  }),
].map((path) => ({
  path: relative(REPO_ROOT, path).split(sep).join('/'),
  source: readFileSync(path, 'utf8'),
}));

function filesMatching(pattern: RegExp): string[] {
  return files.filter((f) => pattern.test(f.source)).map((f) => f.path);
}

describe('CSV is built only by the central writer (csv.ts)', () => {
  it('scans a real tree (guards against a wrong repo-root path)', () => {
    const paths = files.map((f) => f.path);
    expect(paths).toContain(CSV_WRITER);
    expect(paths).toContain(CSV_CONTROLLER);
    expect(paths).toContain(CSV_SERVICE);
    expect(paths.some((p) => p.startsWith('components/'))).toBe(true);
  });

  it('only the reports controller sends a text/csv response', () => {
    expect(filesMatching(/text\/csv/i)).toEqual([CSV_CONTROLLER]);
  });

  it('only csv.ts doubles quotes for CSV escaping', () => {
    expect(filesMatching(/'""'|"\\"\\""|`""`/)).toEqual([CSV_WRITER]);
  });

  it('only csv.ts joins lines with CRLF', () => {
    expect(filesMatching(/\\r\\n/)).toEqual([CSV_WRITER]);
  });

  it('no CSV library is imported (it would bypass the neutralisation)', () => {
    expect(
      filesMatching(
        /from\s+['"](csv-stringify|csv-writer|fast-csv|json2csv|papaparse|@json2csv\/[^'"]+)['"]|require\(\s*['"](csv-stringify|csv-writer|fast-csv|json2csv|papaparse)['"]\s*\)/,
      ),
    ).toEqual([]);
  });

  it('no browser-side CSV download is built (data:text/csv or a CSV Blob)', () => {
    expect(filesMatching(/data:text\/csv|type:\s*['"]text\/csv/i)).toEqual([]);
  });

  it('every ReportsService CSV export returns the central writer output', () => {
    const service = files.find((f) => f.path === CSV_SERVICE)!.source;
    const methods = [...service.matchAll(/async (\w+Csv)\(/g)].map((m) => m[1]);
    // At least today's three; a new export only has to use toCsv too.
    expect(methods).toEqual(
      expect.arrayContaining(['flaggedCsv', 'ticketsCsv', 'workOrdersCsv']),
    );
    for (const name of methods) {
      const start = service.indexOf(`async ${name}(`);
      const next = service.indexOf('\n  async ', start + 1);
      const body = service.slice(start, next === -1 ? undefined : next);
      // Serialization still happens only here, before the required audit write.
      expect(body).toContain('const csv = toCsv(');
      expect(body).toContain('await this.auditExport(');
      expect(body).toContain('return csv;');
    }
  });
});
