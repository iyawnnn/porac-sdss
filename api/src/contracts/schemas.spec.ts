import { CATEGORIES, LEGACY_CATEGORIES, ALL_CATEGORIES, SEVERITIES, reportSchema } from './schemas';

// Phase 6 manuscript-alignment regression guard: CATEGORIES/LEGACY_CATEGORIES
// had no dedicated spec — coverage was only transitive, through
// office.spec.ts's routing table and tickets.service.spec.ts's admin-side
// filter. This pins the actual citizen-submission Zod enum directly.
describe('CATEGORIES (manuscript-aligned, new-submission)', () => {
  it('is exactly the 12 manuscript categories', () => {
    expect(CATEGORIES).toEqual([
      'Pothole / Road Surface Damage',
      'Uneven Sidewalk',
      'Drainage / Culvert / Manhole Issue',
      'Streetlight Out',
      'Localized Flooding',
      'Landslide / Slope Failure',
      'Lahar / Debris-Flow Threat',
      'Fallen Tree / Storm-Related Obstruction',
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
});

describe('LEGACY_CATEGORIES (historical compatibility only)', () => {
  it('is exactly the 11 pre-Phase-3 category strings', () => {
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
    ]);
  });

  it('has no overlap with the current 12 categories except the two unchanged names', () => {
    const overlap = LEGACY_CATEGORIES.filter((c) => (CATEGORIES as readonly string[]).includes(c));
    expect(overlap.sort()).toEqual(['Streetlight Out', 'Uneven Sidewalk']);
  });

  it('ALL_CATEGORIES combines both lists (23 entries)', () => {
    expect(ALL_CATEGORIES).toHaveLength(CATEGORIES.length + LEGACY_CATEGORIES.length);
    for (const c of LEGACY_CATEGORIES) expect(ALL_CATEGORIES).toContain(c);
  });
});

describe('SEVERITIES (citizen-reported, distinct from Hazard Urgency)', () => {
  it('includes Critical — valid only here, never as a Hazard Urgency level', () => {
    expect(SEVERITIES).toEqual(['Low', 'Medium', 'High', 'Critical']);
  });
});
