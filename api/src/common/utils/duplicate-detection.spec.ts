import { readFileSync } from 'fs';
import { join } from 'path';
import { DUPLICATE_MERGE_WINDOW_DAYS } from './duplicate-detection';

describe('DUPLICATE_MERGE_WINDOW_DAYS', () => {
  it('is the PLAN.md §6 authoritative value of 7', () => {
    expect(DUPLICATE_MERGE_WINDOW_DAYS).toBe(7);
  });

  it('is a plain number, not an env-derived value', () => {
    // The business rule doesn't need to vary by deployment (Issue #4
    // investigation) — this stays a code constant, never process.env-backed.
    expect(typeof DUPLICATE_MERGE_WINDOW_DAYS).toBe('number');
    expect(Number.isInteger(DUPLICATE_MERGE_WINDOW_DAYS)).toBe(true);
    expect(DUPLICATE_MERGE_WINDOW_DAYS).toBeGreaterThan(0);
  });
});

// api/scripts/seed/seed-bulk-reports.ts is a one-time demo-data script run
// via tsx, outside Jest's rootDir — it previously hand-rolled its own
// merge query with a hardcoded radius (20, vs. radiusForCategory's 25 for
// Pothole) and no temporal cutoff at all (Issue #4 investigation finding).
// This asserts the fix stuck: the script now imports and uses the same
// shared constant and radius function as production, not a re-diverged
// copy. Source-text check, not an execution test, for the same reasons
// documented in reports.service.spec.ts.
describe('seed-bulk-reports.ts stays wired to the shared duplicate-detection rule', () => {
  const seedScriptSource = readFileSync(
    join(__dirname, '..', '..', '..', 'scripts', 'seed', 'seed-bulk-reports.ts'),
    'utf8',
  );

  it('imports the shared window constant and radius function instead of hardcoding them', () => {
    expect(seedScriptSource).toMatch(/DUPLICATE_MERGE_WINDOW_DAYS/);
    expect(seedScriptSource).toMatch(/radiusForCategory/);
  });

  it('no longer hardcodes the old wrong radius of 20', () => {
    expect(seedScriptSource).not.toMatch(/geography,20\)/);
  });

  it('applies the same active-status and created_at cutoff as production', () => {
    expect(seedScriptSource).toMatch(/status IN \('Reported','Under Review','In Progress'\)/);
    expect(seedScriptSource).toMatch(/created_at>now\(\)-make_interval\(days=>\$\{DUPLICATE_MERGE_WINDOW_DAYS\}\)/);
  });
});
