import type { HazardContextType, HazardLookupStatus } from '../../db/schema';

// DENR-MGB Hazard Information (manuscript pp. 71-72, Appendix H
// HAZARD_INFORMATION; manuscript revision Phase 4, step 4b). Pure helpers:
// which layer a category uses, how a layer's answer maps to a lookup status,
// and the wording staff see. HazardInformationService does the network call
// and the writes.
//
// Advisory only. The source's own susceptibility code and wording are kept
// as they are, never turned into a PORAC-SDSS risk, urgency, severity or
// score, and nothing here feeds Operational Priority, report validity, Work
// Orders or assessments.

const MGB_BASE =
  'https://controlmap.mgb.gov.ph/arcgis/rest/services/GeospatialDataInventory_Public';

export interface HazardLayer {
  // Short name staff see before the result ("Flood: MF ...").
  name: string;
  // The layer's own title, as the source names it.
  sourceName: string;
  queryUrl: string;
  // The susceptibility field. The two layers use different names.
  field: string;
  // Code -> the source's own wording. Verified on 2026-10-29 from each
  // layer's metadata (<layer>/MapServer/0?f=json, drawingInfo.renderer
  // uniqueValueInfos labels; the layers carry no coded-value domain). A code
  // missing here is stored with a NULL label, never an invented one.
  labels: Readonly<Record<string, string>>;
}

export const HAZARD_LAYERS: Readonly<Record<HazardContextType, HazardLayer>> = {
  FLOOD: {
    name: 'Flood',
    sourceName: 'DENR-MGB Detailed Flood Susceptibility',
    queryUrl: `${MGB_BASE}/GDI_Detailed_Flood_Susceptibility_Public/MapServer/0/query`,
    field: 'FloodSusc',
    labels: {
      VHF: 'Very High Susceptibility to Flooding',
      HF: 'High Susceptibility to Flooding',
      MF: 'Moderate Susceptibility to Flooding',
      LF: 'Low Susceptibility to Flooding',
    },
  },
  RAIN_INDUCED_LANDSLIDE: {
    name: 'Rain-induced landslide',
    sourceName: 'DENR-MGB Detailed Rain-induced Landslide Susceptibility',
    queryUrl: `${MGB_BASE}/GDI_Detailed_Rain_induced_Landslide_Susceptibility_Public/MapServer/0/query`,
    field: 'LndslideSusc',
    labels: {
      VHL: 'Very High Susceptibility to Landslide',
      HL: 'High Susceptibility to Landslide',
      ML: 'Moderate Susceptibility to Landslide',
      LL: 'Low Susceptibility to Landslide',
      DF: 'Debris flow path/Possible accumulation zone',
    },
  },
};

// 'applicable': the category has a DENR-MGB layer. Lahar or Volcanic
// Debris-Flow Threat: no automated classification in this version. Every
// other category: not applicable. Neither of the last two ever gets a row.
export type HazardApplicability =
  'applicable' | 'not_applicable' | 'no_automated_classification';

// The manuscript categories, plus the legacy names docs/database.md maps to
// them, so older tickets that still carry one behave the same.
const CATEGORY_CONTEXT: Readonly<Record<string, HazardContextType>> = {
  'Localized Flooding': 'FLOOD',
  Flooding: 'FLOOD',
  'Rain-Induced Slope Failure/Landslide': 'RAIN_INDUCED_LANDSLIDE',
  'Landslide / Slope Failure': 'RAIN_INDUCED_LANDSLIDE',
};
const NO_AUTOMATED_CLASSIFICATION = new Set([
  'Lahar or Volcanic Debris-Flow Threat',
  'Lahar / Debris-Flow Threat',
]);

export function hazardContextForCategory(category: string): {
  applicability: HazardApplicability;
  contextType: HazardContextType | null;
} {
  const contextType = CATEGORY_CONTEXT[category] ?? null;
  if (contextType) return { applicability: 'applicable', contextType };
  return {
    applicability: NO_AUTOMATED_CLASSIFICATION.has(category)
      ? 'no_automated_classification'
      : 'not_applicable',
    contextType: null,
  };
}

// The categories that get a lookup, for the backfill script's SQL filter.
export const HAZARD_APPLICABLE_CATEGORIES = Object.keys(CATEGORY_CONTEXT);

// The point query, exactly as the layer expects it (WGS 84 lng,lat).
export function hazardQueryUrl(
  contextType: HazardContextType,
  lat: number,
  lng: number,
): string {
  const layer = HAZARD_LAYERS[contextType];
  const params = new URLSearchParams({
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: layer.field,
    returnGeometry: 'false',
    f: 'json',
  });
  return `${layer.queryUrl}?${params.toString()}`;
}

export interface HazardLookupResult {
  lookupStatus: HazardLookupStatus;
  susceptibilityCode: string | null;
  susceptibilityLabel: string | null;
  failureReason: string | null;
}

export function unavailable(reason: string): HazardLookupResult {
  return {
    lookupStatus: 'TEMPORARILY_UNAVAILABLE',
    susceptibilityCode: null,
    susceptibilityLabel: null,
    failureReason: reason,
  };
}

// Maps a parsed layer response. An ArcGIS error comes back as HTTP 200 with
// an "error" object. Features present = CLASSIFIED (the first feature's
// code); no features = NO_CLASSIFICATION, which is never Low or safe.
export function parseLayerResponse(
  contextType: HazardContextType,
  body: unknown,
): HazardLookupResult {
  if (typeof body !== 'object' || body === null) {
    return unavailable('Unexpected response: not a JSON object');
  }
  const json = body as {
    error?: { code?: unknown; message?: unknown };
    features?: unknown;
  };
  if (json.error) {
    const code =
      typeof json.error.code === 'number' || typeof json.error.code === 'string'
        ? ` ${json.error.code}`
        : '';
    const message =
      typeof json.error.message === 'string' ? `: ${json.error.message}` : '';
    return unavailable(`ArcGIS error${code}${message}`.slice(0, 500));
  }
  if (!Array.isArray(json.features)) {
    return unavailable('Unexpected response: no features array');
  }
  if (json.features.length === 0) {
    return {
      lookupStatus: 'NO_CLASSIFICATION',
      susceptibilityCode: null,
      susceptibilityLabel: null,
      failureReason: null,
    };
  }
  const layer = HAZARD_LAYERS[contextType];
  const feature = json.features[0] as { attributes?: Record<string, unknown> };
  const raw = feature?.attributes?.[layer.field];
  if (typeof raw !== 'string' || raw.trim() === '') {
    return unavailable(`Unexpected response: feature has no ${layer.field}`);
  }
  const code = raw.trim().slice(0, 20);
  return {
    lookupStatus: 'CLASSIFIED',
    susceptibilityCode: code,
    susceptibilityLabel: layer.labels[code] ?? null,
    failureReason: null,
  };
}

// The words staff see for each state, shared by the CSV export and the
// queue / dashboard summary line. Ticket Detail's panel words them the same
// way (app/admin/tickets/[id]/page.tsx).
export const HAZARD_STATE_TEXT = {
  NO_CLASSIFICATION: 'No DENR-MGB classification at this location',
  TEMPORARILY_UNAVAILABLE: 'Temporarily unavailable',
  NOT_YET_CHECKED: 'Not yet checked',
  NO_AUTOMATED_CLASSIFICATION: 'No automated classification in this version',
  NOT_APPLICABLE: 'Not applicable',
} as const;

export interface CurrentHazardRow {
  hazard_context_type: HazardContextType;
  lookup_status: HazardLookupStatus;
  susceptibility_code: string | null;
  susceptibility_label: string | null;
}

// One line: "Flood: MF (Moderate Susceptibility to Flooding)", "Flood: No
// DENR-MGB classification at this location", "Not applicable", ... A current
// row for another context type (the category just changed and the new lookup
// hasn't finished) counts as not yet checked.
export function hazardSummary(
  category: string,
  current: CurrentHazardRow | null,
): string {
  const { applicability, contextType } = hazardContextForCategory(category);
  if (applicability === 'not_applicable')
    return HAZARD_STATE_TEXT.NOT_APPLICABLE;
  if (!contextType) return HAZARD_STATE_TEXT.NO_AUTOMATED_CLASSIFICATION;
  const name = HAZARD_LAYERS[contextType].name;
  if (!current || current.hazard_context_type !== contextType) {
    return `${name}: ${HAZARD_STATE_TEXT.NOT_YET_CHECKED}`;
  }
  if (current.lookup_status === 'CLASSIFIED') {
    return current.susceptibility_label
      ? `${name}: ${current.susceptibility_code} (${current.susceptibility_label})`
      : `${name}: ${current.susceptibility_code}`;
  }
  return `${name}: ${HAZARD_STATE_TEXT[current.lookup_status]}`;
}
