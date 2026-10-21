import { readFileSync } from 'fs';
import { join } from 'path';
import { CATEGORIES, LEGACY_CATEGORIES, ALL_CATEGORIES, SEVERITIES, reportSchema } from './schemas';

// The four category strings retired in manuscript revision Phase 2, step 2a
// (Decisions 6, 9, 13): no longer accepted for new submissions, still valid
// as legacy values.
const RETIRED_IN_PHASE2_STEP2A = [
  'Drainage / Culvert / Manhole Issue',
  'Landslide / Slope Failure',
  'Lahar / Debris-Flow Threat',
  'Fallen Tree / Storm-Related Obstruction',
];

// Phase 6 manuscript-alignment regression guard: CATEGORIES/LEGACY_CATEGORIES
// had no dedicated spec — coverage was only transitive, through
// office.spec.ts's routing table and tickets.service.spec.ts's admin-side
// filter. This pins the actual citizen-submission Zod enum directly.
describe('CATEGORIES (manuscript-aligned, new-submission)', () => {
  it('is exactly the 13 manuscript categories', () => {
    expect(CATEGORIES).toEqual([
      'Pothole / Road Surface Damage',
      'Uneven Sidewalk',
      'Damaged Manhole Cover',
      'Clogged Drainage / Damaged Culvert',
      'Streetlight Out',
      'Localized Flooding',
      'Rain-Induced Slope Failure/Landslide',
      'Lahar or Volcanic Debris-Flow Threat',
      'Fallen Tree or Storm-Related Road Obstruction',
      'Illegal Dumping Affecting Drainage or Road',
      'Overgrown Vegetation Obstructing Road or Signage',
      'Leaking Pipe / Water Supply Concern',
      'Other Minor Infrastructure Hazard',
    ]);
  });

  it('does not include Uncollected Garbage', () => {
    expect(CATEGORIES).not.toContain('Uncollected Garbage');
  });

  it('accepts every current category on reportSchema, and rejects a legacy-only value', () => {
    const base = {
      title: 'Test',
      citizenSeverity: 'Low' as const,
      lat: 15.1,
      lng: 120.5,
    };
    for (const category of CATEGORIES) {
      expect(reportSchema.safeParse({ ...base, category }).success).toBe(true);
    }
    expect(reportSchema.safeParse({ ...base, category: 'Uncollected Garbage' }).success).toBe(false);
  });

  it('accepts the five names added in manuscript revision Phase 2, step 2a and rejects the four it retired', () => {
    const base = {
      title: 'Test',
      citizenSeverity: 'Low' as const,
      lat: 15.1,
      lng: 120.5,
    };
    for (const category of [
      'Damaged Manhole Cover',
      'Clogged Drainage / Damaged Culvert',
      'Rain-Induced Slope Failure/Landslide',
      'Lahar or Volcanic Debris-Flow Threat',
      'Fallen Tree or Storm-Related Road Obstruction',
    ]) {
      expect(reportSchema.safeParse({ ...base, category }).success).toBe(true);
    }
    for (const category of RETIRED_IN_PHASE2_STEP2A) {
      expect(reportSchema.safeParse({ ...base, category }).success).toBe(false);
    }
  });
});

describe('LEGACY_CATEGORIES (historical compatibility only)', () => {
  it('is exactly the 11 pre-Phase-3 category strings plus the 4 retired in Phase 2, step 2a', () => {
    expect(LEGACY_CATEGORIES).toEqual([
      'Flooding',
      'Clogged Drain',
      'Fallen Tree',
      'Pothole',
      'Uneven Sidewalk',
      'Streetlight Out',
      'Leaking Pipe',
      'Uncollected Garbage',
      'Illegal Dumping',
      'Overgrown Vegetation',
      'Other',
      ...RETIRED_IN_PHASE2_STEP2A,
    ]);
  });

  it('has no overlap with the current 13 categories except the two unchanged names', () => {
    const overlap = LEGACY_CATEGORIES.filter((c) => (CATEGORIES as readonly string[]).includes(c));
    expect(overlap.sort()).toEqual(['Streetlight Out', 'Uneven Sidewalk']);
  });

  it('ALL_CATEGORIES combines both lists (28 entries)', () => {
    expect(ALL_CATEGORIES).toHaveLength(CATEGORIES.length + LEGACY_CATEGORIES.length);
    expect(ALL_CATEGORIES).toHaveLength(28);
    for (const c of LEGACY_CATEGORIES) expect(ALL_CATEGORIES).toContain(c);
    for (const c of RETIRED_IN_PHASE2_STEP2A)
      expect(ALL_CATEGORIES).toContain(c);
  });
});

// The frontend keeps deliberate copies of these lists (it can't import across
// the lib/ <-> api/ boundary — CLAUDE.md), so a source scan is the only thing
// that keeps them from drifting: the citizen form, the admin filters and the
// legacy deep-link check must offer exactly what the API validates.
describe('frontend category lists mirror the API exactly', () => {
  const repoRoot = join(__dirname, '..', '..', '..');
  function stringArray(relPath: string, constName: string): string[] {
    const source = readFileSync(join(repoRoot, relPath), 'utf8');
    const start = source.indexOf(`export const ${constName} = [`);
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf('] as const;', start));
    return [...body.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  }

  it('lib/utils/validation.ts CATEGORIES (citizen report form) equals CATEGORIES', () => {
    expect(stringArray('lib/utils/validation.ts', 'CATEGORIES')).toEqual([
      ...CATEGORIES,
    ]);
  });

  it('lib/types/admin-ticket-constants.ts TICKET_CATEGORIES equals CATEGORIES', () => {
    expect(
      stringArray('lib/types/admin-ticket-constants.ts', 'TICKET_CATEGORIES'),
    ).toEqual([...CATEGORIES]);
  });

  it('lib/types/admin-ticket-constants.ts LEGACY_TICKET_CATEGORIES equals LEGACY_CATEGORIES', () => {
    expect(
      stringArray(
        'lib/types/admin-ticket-constants.ts',
        'LEGACY_TICKET_CATEGORIES',
      ),
    ).toEqual([...LEGACY_CATEGORIES]);
  });
});

describe('SEVERITIES (citizen-reported, distinct from Hazard Urgency)', () => {
  it('includes Critical — valid only here, never as a Hazard Urgency level', () => {
    expect(SEVERITIES).toEqual(['Low', 'Medium', 'High', 'Critical']);
  });
});
