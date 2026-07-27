// Single source of truth for which LGU the geo pipeline targets. Swap by
// setting these env vars in .env.local — no code changes needed to re-run
// the seed scripts (import:barangays-v2, import:city-boundary, seed:dem)
// against a different municipality. Defaults are Angeles City, the current
// target.
export const MUNICIPALITY = {
  name: process.env.TARGET_MUNICIPALITY_NAME ?? "Angeles City",
  psgcCode: process.env.TARGET_MUNICIPALITY_PSGC_CODE ?? "330100000",
  barangayCount: Number(process.env.TARGET_BARANGAY_COUNT ?? 33),
  // Representative point for the OpenWeatherMap lookup and default map
  // center. NEXT_PUBLIC_-prefixed so client components (MapClient,
  // ReportForm) can read it too — Next.js inlines these at build time.
  centerLat: Number(process.env.NEXT_PUBLIC_TARGET_CITY_CENTER_LAT ?? 15.14),
  centerLng: Number(process.env.NEXT_PUBLIC_TARGET_CITY_CENTER_LNG ?? 120.57),
  // Filenames at repo root, produced by the manual PSGC-filter / Overpass /
  // SRTM-clip steps documented in PLAN.md §4.1-4.2 for whichever city is
  // being seeded.
  psgcDataFile: process.env.TARGET_PSGC_DATA_FILE ?? "angeles_psgc.json",
  demTiffFile: process.env.TARGET_DEM_TIFF_FILE ?? "angeles_city_srtm30m.tif",
  overpassBoundaryFile: process.env.TARGET_OVERPASS_BOUNDARY_FILE ?? "overpass_angeles_city.json",
  osmRelationId: process.env.TARGET_OSM_RELATION_ID ?? "9386775",
};
