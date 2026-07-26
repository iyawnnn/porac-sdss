-- Angeles City's outer administrative boundary from OSM (relation 9386775,
-- admin_level=6), used only as an accept/reject outer envelope for
-- containment fallback — barangay identity always comes from GADM's
-- `barangays` table, never from this. See lib/geo/barangay.ts.
CREATE TABLE IF NOT EXISTS city_boundary_osm (
  id serial PRIMARY KEY,
  source text NOT NULL,
  geom geometry(MultiPolygon, 4326) NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS city_boundary_osm_geom_idx ON city_boundary_osm USING GIST (geom);
