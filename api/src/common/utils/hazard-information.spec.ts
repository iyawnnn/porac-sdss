import {
  HAZARD_APPLICABLE_CATEGORIES,
  HAZARD_LAYERS,
  HAZARD_STATE_TEXT,
  hazardContextForCategory,
  hazardQueryUrl,
  hazardSummary,
  parseLayerResponse,
} from './hazard-information';
import { CATEGORIES } from '../../contracts/schemas';

// Manuscript revision Phase 4, step 4b. Pure helpers only; no network.

describe('hazardContextForCategory', () => {
  it('Localized Flooding uses the flood layer, Rain-Induced Slope Failure/Landslide the landslide layer', () => {
    expect(hazardContextForCategory('Localized Flooding')).toEqual({
      applicability: 'applicable',
      contextType: 'FLOOD',
    });
    expect(
      hazardContextForCategory('Rain-Induced Slope Failure/Landslide'),
    ).toEqual({
      applicability: 'applicable',
      contextType: 'RAIN_INDUCED_LANDSLIDE',
    });
  });

  it('the legacy names behave like the categories they map to', () => {
    expect(hazardContextForCategory('Flooding').contextType).toBe('FLOOD');
    expect(
      hazardContextForCategory('Landslide / Slope Failure').contextType,
    ).toBe('RAIN_INDUCED_LANDSLIDE');
    expect(hazardContextForCategory('Lahar / Debris-Flow Threat')).toEqual({
      applicability: 'no_automated_classification',
      contextType: null,
    });
  });

  it('Lahar gets no automated classification; every other category is not applicable', () => {
    expect(
      hazardContextForCategory('Lahar or Volcanic Debris-Flow Threat'),
    ).toEqual({
      applicability: 'no_automated_classification',
      contextType: null,
    });
    const others = CATEGORIES.filter(
      (c) =>
        ![
          'Localized Flooding',
          'Rain-Induced Slope Failure/Landslide',
          'Lahar or Volcanic Debris-Flow Threat',
        ].includes(c),
    );
    expect(others).toHaveLength(10);
    for (const category of others) {
      expect(hazardContextForCategory(category)).toEqual({
        applicability: 'not_applicable',
        contextType: null,
      });
    }
  });

  it('lists exactly the categories that get a lookup', () => {
    expect([...HAZARD_APPLICABLE_CATEGORIES].sort()).toEqual(
      [
        'Flooding',
        'Landslide / Slope Failure',
        'Localized Flooding',
        'Rain-Induced Slope Failure/Landslide',
      ].sort(),
    );
  });
});

describe('hazardQueryUrl', () => {
  it('queries the flood layer at lng,lat for FloodSusc, no geometry, JSON', () => {
    const url = new URL(hazardQueryUrl('FLOOD', 15.08, 120.54));
    expect(`${url.origin}${url.pathname}`).toBe(
      'https://controlmap.mgb.gov.ph/arcgis/rest/services/GeospatialDataInventory_Public/GDI_Detailed_Flood_Susceptibility_Public/MapServer/0/query',
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      geometry: '120.54,15.08',
      geometryType: 'esriGeometryPoint',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: 'FloodSusc',
      returnGeometry: 'false',
      f: 'json',
    });
  });

  it('queries the landslide layer for LndslideSusc (not FloodSusc)', () => {
    const url = new URL(hazardQueryUrl('RAIN_INDUCED_LANDSLIDE', 15.1, 120.4));
    expect(url.pathname).toContain(
      '/GDI_Detailed_Rain_induced_Landslide_Susceptibility_Public/MapServer/0/query',
    );
    expect(url.searchParams.get('outFields')).toBe('LndslideSusc');
    expect(url.searchParams.get('geometry')).toBe('120.4,15.1');
  });
});

describe('parseLayerResponse', () => {
  it('features present: CLASSIFIED with the source code and its verified wording', () => {
    expect(
      parseLayerResponse('FLOOD', {
        features: [{ attributes: { FloodSusc: 'MF' } }],
      }),
    ).toEqual({
      lookupStatus: 'CLASSIFIED',
      susceptibilityCode: 'MF',
      susceptibilityLabel: 'Moderate Susceptibility to Flooding',
      failureReason: null,
    });
  });

  it('reads the landslide field name, including the debris-flow code', () => {
    expect(
      parseLayerResponse('RAIN_INDUCED_LANDSLIDE', {
        features: [{ attributes: { LndslideSusc: 'DF' } }],
      }),
    ).toEqual({
      lookupStatus: 'CLASSIFIED',
      susceptibilityCode: 'DF',
      susceptibilityLabel: 'Debris flow path/Possible accumulation zone',
      failureReason: null,
    });
    // A FloodSusc attribute on the landslide layer is not its field.
    expect(
      parseLayerResponse('RAIN_INDUCED_LANDSLIDE', {
        features: [{ attributes: { FloodSusc: 'HF' } }],
      }).lookupStatus,
    ).toBe('TEMPORARILY_UNAVAILABLE');
  });

  it('a code with no verified wording keeps the code and a NULL label', () => {
    expect(
      parseLayerResponse('FLOOD', {
        features: [{ attributes: { FloodSusc: 'XYZ' } }],
      }),
    ).toMatchObject({
      lookupStatus: 'CLASSIFIED',
      susceptibilityCode: 'XYZ',
      susceptibilityLabel: null,
    });
  });

  it('no features: NO_CLASSIFICATION, with no code or label', () => {
    expect(parseLayerResponse('FLOOD', { features: [] })).toEqual({
      lookupStatus: 'NO_CLASSIFICATION',
      susceptibilityCode: null,
      susceptibilityLabel: null,
      failureReason: null,
    });
  });

  it('an ArcGIS error object (sent with HTTP 200) is TEMPORARILY_UNAVAILABLE with its reason', () => {
    expect(
      parseLayerResponse('FLOOD', {
        error: { code: 400, message: 'Unable to complete operation.' },
      }),
    ).toEqual({
      lookupStatus: 'TEMPORARILY_UNAVAILABLE',
      susceptibilityCode: null,
      susceptibilityLabel: null,
      failureReason: 'ArcGIS error 400: Unable to complete operation.',
    });
  });

  it('a response without a features array or not an object is TEMPORARILY_UNAVAILABLE', () => {
    expect(parseLayerResponse('FLOOD', { foo: 1 })).toMatchObject({
      lookupStatus: 'TEMPORARILY_UNAVAILABLE',
      failureReason: 'Unexpected response: no features array',
    });
    expect(parseLayerResponse('FLOOD', 'nope').lookupStatus).toBe(
      'TEMPORARILY_UNAVAILABLE',
    );
    expect(parseLayerResponse('FLOOD', null).lookupStatus).toBe(
      'TEMPORARILY_UNAVAILABLE',
    );
  });
});

describe('the verified source wording', () => {
  it('keeps every code the two layers draw, in the source terms', () => {
    expect(Object.keys(HAZARD_LAYERS.FLOOD.labels)).toEqual([
      'VHF',
      'HF',
      'MF',
      'LF',
    ]);
    expect(Object.keys(HAZARD_LAYERS.RAIN_INDUCED_LANDSLIDE.labels)).toEqual([
      'VHL',
      'HL',
      'ML',
      'LL',
      'DF',
    ]);
  });
});

describe('hazardSummary', () => {
  const row = (overrides: Record<string, unknown> = {}) => ({
    hazard_context_type: 'FLOOD' as const,
    lookup_status: 'CLASSIFIED' as const,
    susceptibility_code: 'MF',
    susceptibility_label: 'Moderate Susceptibility to Flooding',
    ...overrides,
  });

  it('words each state', () => {
    expect(hazardSummary('Localized Flooding', row())).toBe(
      'Flood: MF (Moderate Susceptibility to Flooding)',
    );
    expect(
      hazardSummary('Localized Flooding', row({ susceptibility_label: null })),
    ).toBe('Flood: MF');
    expect(
      hazardSummary(
        'Localized Flooding',
        row({
          lookup_status: 'NO_CLASSIFICATION',
          susceptibility_code: null,
          susceptibility_label: null,
        }),
      ),
    ).toBe('Flood: No DENR-MGB classification at this location');
    expect(
      hazardSummary(
        'Rain-Induced Slope Failure/Landslide',
        row({
          hazard_context_type: 'RAIN_INDUCED_LANDSLIDE',
          lookup_status: 'TEMPORARILY_UNAVAILABLE',
          susceptibility_code: null,
          susceptibility_label: null,
        }),
      ),
    ).toBe('Rain-induced landslide: Temporarily unavailable');
    expect(hazardSummary('Localized Flooding', null)).toBe(
      'Flood: Not yet checked',
    );
    expect(hazardSummary('Lahar or Volcanic Debris-Flow Threat', null)).toBe(
      'No automated classification in this version',
    );
    expect(hazardSummary('Streetlight Out', null)).toBe('Not applicable');
  });

  it('a current row for another context type counts as not yet checked', () => {
    expect(hazardSummary('Rain-Induced Slope Failure/Landslide', row())).toBe(
      'Rain-induced landslide: Not yet checked',
    );
  });

  it('never words NO_CLASSIFICATION as low or safe', () => {
    expect(HAZARD_STATE_TEXT.NO_CLASSIFICATION).not.toMatch(/low|safe/i);
  });
});
