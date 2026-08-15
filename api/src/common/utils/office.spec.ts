import { categoryRouting, officeForCategory } from './office';

describe('categoryRouting — new (manuscript-aligned) categories', () => {
  it('routes each new category to its manuscript-aligned office and responsibility', () => {
    expect(categoryRouting('Pothole / Road Surface Damage')).toEqual({ office: 'MEO', directResponsibility: true });
    expect(categoryRouting('Uneven Sidewalk')).toEqual({ office: 'MEO', directResponsibility: true });
    expect(categoryRouting('Drainage / Culvert / Manhole Issue')).toEqual({ office: 'MEO', directResponsibility: true });
    expect(categoryRouting('Streetlight Out')).toEqual({ office: 'MEO', directResponsibility: true });
    expect(categoryRouting('Localized Flooding')).toEqual({ office: 'MDRRMO', directResponsibility: true });
    expect(categoryRouting('Landslide / Slope Failure')).toEqual({ office: 'MDRRMO', directResponsibility: true });
    expect(categoryRouting('Lahar / Debris-Flow Threat')).toEqual({ office: 'MDRRMO', directResponsibility: true });
    expect(categoryRouting('Fallen Tree / Storm-Related Obstruction')).toEqual({ office: 'MDRRMO', directResponsibility: true });
    expect(categoryRouting('Illegal Dumping Affecting Drainage or Road')).toEqual({ office: 'MEO', directResponsibility: false });
    expect(categoryRouting('Overgrown Vegetation Obstructing Road or Signage')).toEqual({ office: 'MEO', directResponsibility: false });
    expect(categoryRouting('Leaking Pipe / Water Supply Concern')).toEqual({ office: 'MEO', directResponsibility: false });
    expect(categoryRouting('Other Minor Infrastructure Hazard')).toEqual({ office: 'MEO', directResponsibility: false });
  });
});

describe('categoryRouting — legacy (pre-Phase-3-follow-up) categories', () => {
  it('still resolves every legacy category safely, matching its new-category semantic equivalent', () => {
    expect(categoryRouting('Flooding')).toEqual({ office: 'MDRRMO', directResponsibility: true });
    expect(categoryRouting('Clogged Drain')).toEqual({ office: 'MEO', directResponsibility: true });
    expect(categoryRouting('Fallen Tree')).toEqual({ office: 'MDRRMO', directResponsibility: true });
    expect(categoryRouting('Pothole')).toEqual({ office: 'MEO', directResponsibility: true });
    expect(categoryRouting('Leaking Pipe')).toEqual({ office: 'MEO', directResponsibility: false });
    expect(categoryRouting('Uncollected Garbage')).toEqual({ office: 'MEO', directResponsibility: false });
    expect(categoryRouting('Illegal Dumping')).toEqual({ office: 'MEO', directResponsibility: false });
    expect(categoryRouting('Overgrown Vegetation')).toEqual({ office: 'MEO', directResponsibility: false });
    // Aligned to false to match its new equivalent, "Other Minor Infrastructure
    // Hazard" — a generic "Other" report was never a confirmed direct
    // responsibility, just triaged there by default.
    expect(categoryRouting('Other')).toEqual({ office: 'MEO', directResponsibility: false });
  });

  it('routes the stray "Soil Erosion" seed value to its closest manuscript-aligned equivalent instead of the generic unknown fallback', () => {
    expect(categoryRouting('Soil Erosion')).toEqual({ office: 'MDRRMO', directResponsibility: true });
  });

  it('routes an unrecognized category to MEO custody flagged non-direct, not silently as normal MEO work', () => {
    expect(categoryRouting('Not A Real Category')).toEqual({
      office: 'MEO',
      directResponsibility: false,
    });
  });
});

describe('officeForCategory', () => {
  it('returns just the office half of categoryRouting for every new, legacy, and unknown category', () => {
    for (const category of [
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
      'Flooding',
      'Clogged Drain',
      'Fallen Tree',
      'Pothole',
      'Leaking Pipe',
      'Uncollected Garbage',
      'Illegal Dumping',
      'Overgrown Vegetation',
      'Other',
      'Soil Erosion',
      'Not A Real Category',
    ]) {
      expect(officeForCategory(category)).toBe(categoryRouting(category).office);
    }
  });
});
