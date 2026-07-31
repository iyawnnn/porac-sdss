export const MUNICIPALITY = {
  name: process.env.TARGET_MUNICIPALITY_NAME ?? 'Municipality of Porac',
  psgcCode: process.env.TARGET_MUNICIPALITY_PSGC_CODE ?? '030541500',
  barangayCount: Number(process.env.TARGET_BARANGAY_COUNT ?? 29),
  centerLat: Number(process.env.NEXT_PUBLIC_TARGET_CITY_CENTER_LAT ?? 15.0711),
  centerLng: Number(process.env.NEXT_PUBLIC_TARGET_CITY_CENTER_LNG ?? 120.5401),
  defaultZoom: Number(process.env.NEXT_PUBLIC_TARGET_MAP_ZOOM ?? 12),
  minLat: Number(process.env.TARGET_MIN_LAT ?? 14.98),
  maxLat: Number(process.env.TARGET_MAX_LAT ?? 15.16),
  minLng: Number(process.env.TARGET_MIN_LNG ?? 120.35),
  maxLng: Number(process.env.TARGET_MAX_LNG ?? 120.62),
  psgcDataFile:
    process.env.TARGET_PSGC_DATA_FILE ??
    'public/assets/gis/porac_barangays.json',
  demTiffFile:
    process.env.TARGET_DEM_TIFF_FILE ?? 'scripts/gis/raw/porac_srtm30m.tif',
  osmBoundaryFile:
    process.env.TARGET_OSM_BOUNDARY_FILE ??
    'public/assets/gis/porac_osm_boundary.json',
};
