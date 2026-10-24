import { CATEGORIES, LEGACY_CATEGORIES } from '../../contracts/schemas';
import {
  DEFAULT_RADIUS_M,
  RADIUS_BY_CATEGORY,
  radiusForCategory,
} from './radius';

// Manuscript revision Phase 3, step 3c: the related-ticket search radius
// (manuscript pp. 31, 78).
describe('radiusForCategory', () => {
  it.each([...CATEGORIES, ...LEGACY_CATEGORIES])(
    '%s has an explicit entry',
    (category) => {
      expect(Object.hasOwn(RADIUS_BY_CATEGORY, category)).toBe(true);
    },
  );

  it.each([
    ['Pothole / Road Surface Damage', 20],
    ['Streetlight Out', 20],
    ['Damaged Manhole Cover', 20],
    ['Clogged Drainage / Damaged Culvert', 50],
    ['Uneven Sidewalk', 50],
    ['Fallen Tree or Storm-Related Road Obstruction', 50],
    ['Overgrown Vegetation Obstructing Road or Signage', 50],
    ['Illegal Dumping Affecting Drainage or Road', 50],
    ['Leaking Pipe / Water Supply Concern', 50],
    ['Other Minor Infrastructure Hazard', 50],
    ['Localized Flooding', 100],
    ['Rain-Induced Slope Failure/Landslide', 100],
    ['Lahar or Volcanic Debris-Flow Threat', 100],
  ])('%s searches within %i m', (category, radius) => {
    expect(radiusForCategory(category)).toBe(radius);
  });

  it.each([
    ['Pothole', 'Pothole / Road Surface Damage'],
    ['Clogged Drain', 'Clogged Drainage / Damaged Culvert'],
    ['Flooding', 'Localized Flooding'],
    ['Fallen Tree', 'Fallen Tree or Storm-Related Road Obstruction'],
    ['Leaking Pipe', 'Leaking Pipe / Water Supply Concern'],
    ['Illegal Dumping', 'Illegal Dumping Affecting Drainage or Road'],
    [
      'Overgrown Vegetation',
      'Overgrown Vegetation Obstructing Road or Signage',
    ],
    ['Other', 'Other Minor Infrastructure Hazard'],
    ['Landslide / Slope Failure', 'Rain-Induced Slope Failure/Landslide'],
    ['Lahar / Debris-Flow Threat', 'Lahar or Volcanic Debris-Flow Threat'],
    [
      'Fallen Tree / Storm-Related Obstruction',
      'Fallen Tree or Storm-Related Road Obstruction',
    ],
    [
      'Drainage / Culvert / Manhole Issue',
      'Clogged Drainage / Damaged Culvert',
    ],
  ])('legacy %s has the radius of %s', (legacy, current) => {
    expect(radiusForCategory(legacy)).toBe(radiusForCategory(current));
  });

  it('defaults an unknown category to 50 m', () => {
    expect(DEFAULT_RADIUS_M).toBe(50);
    expect(radiusForCategory('Not A Real Category')).toBe(50);
    expect(radiusForCategory('constructor')).toBe(50);
  });
});
