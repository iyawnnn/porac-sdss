import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseBulkOptions } from '../../../scripts/lib/bulk-demo';
import { NON_PRODUCTION_FLAG } from '../../../scripts/lib/seed-target';

const script = (name: string) =>
  readFileSync(join(__dirname, '../../../scripts', name), 'utf8');
describe('demo submission and explicit grouping', () => {
  it.each(['lib/demo-workflow.ts', 'lib/bulk-demo.ts'])(
    '%s submits through the real report service without the retired automatic merge path',
    (file) => {
      const source = script(file);
      expect(source).toContain('.reports.submit(');
      expect(source).not.toContain('DUPLICATE_MERGE_WINDOW_DAYS');
      expect(source).not.toMatch(
        /INSERT\s+INTO\s+(?:reports|tickets)\b|DELETE\s+FROM|TRUNCATE/i,
      );
    },
  );
  it('the presentation demo queries suggestions before invoking the staff merge service', () => {
    const source = script('lib/demo-workflow.ts');
    expect(source.indexOf('svc.related.forTicket')).toBeLessThan(
      source.indexOf('svc.grouping.merge'),
    );
    expect(source).toContain('survivorTicketId:');
    expect(source).toContain('mergedTicketId:');
  });
});
describe('optional bulk CLI', () => {
  it('defaults to three reports with non-empty refusal', () => {
    expect(parseBulkOptions([])).toEqual({ count: 3, append: false });
  });
  it('accepts explicit append and count without confusing the target guard flag or pnpm separator', () => {
    expect(
      parseBulkOptions(['--', '--append', '--count', '5', NON_PRODUCTION_FLAG]),
    ).toEqual({ count: 5, append: true });
  });
  it.each([
    ['--count', '0'],
    ['--count', '16'],
    ['--count', '-1'],
    ['--count'],
    ['--count', 'abc'],
    ['--unknown'],
  ])('rejects malformed or unsupported bulk options %#', (...args) => {
    expect(() => parseBulkOptions(args)).toThrow();
  });
});
