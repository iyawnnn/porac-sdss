import { categoryRouting, officeForCategory } from './office';

describe('categoryRouting', () => {
  it('routes each category to its manuscript-aligned office and responsibility', () => {
    expect(categoryRouting('Flooding')).toEqual({ office: 'MDRRMO', directResponsibility: true });
    expect(categoryRouting('Clogged Drain')).toEqual({ office: 'MEO', directResponsibility: true });
    expect(categoryRouting('Fallen Tree')).toEqual({ office: 'MDRRMO', directResponsibility: true });
    expect(categoryRouting('Pothole')).toEqual({ office: 'MEO', directResponsibility: true });
    expect(categoryRouting('Uneven Sidewalk')).toEqual({ office: 'MEO', directResponsibility: true });
    expect(categoryRouting('Streetlight Out')).toEqual({ office: 'MEO', directResponsibility: true });
    expect(categoryRouting('Leaking Pipe')).toEqual({ office: 'MEO', directResponsibility: false });
    expect(categoryRouting('Uncollected Garbage')).toEqual({ office: 'MEO', directResponsibility: false });
    expect(categoryRouting('Illegal Dumping')).toEqual({ office: 'MEO', directResponsibility: false });
    expect(categoryRouting('Overgrown Vegetation')).toEqual({ office: 'MEO', directResponsibility: false });
    expect(categoryRouting('Other')).toEqual({ office: 'MEO', directResponsibility: true });
  });

  it('routes an unrecognized category to MEO custody flagged non-direct, not silently as normal MEO work', () => {
    expect(categoryRouting('Not A Real Category')).toEqual({
      office: 'MEO',
      directResponsibility: false,
    });
  });
});

describe('officeForCategory', () => {
  it('returns just the office half of categoryRouting for every category', () => {
    for (const category of [
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
      'Not A Real Category',
    ]) {
      expect(officeForCategory(category)).toBe(categoryRouting(category).office);
    }
  });
});
