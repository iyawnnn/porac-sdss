-- Geometry columns for tickets/reports. Applied via scripts/migrate-geometry.ts,
-- not drizzle-kit, since drizzle's PostGIS support is weak (see lib/db/raw.ts).

ALTER TABLE tickets ADD COLUMN geom geometry(Point, 4326) NOT NULL;
CREATE INDEX tickets_geom_idx ON tickets USING GIST (geom);
ALTER TABLE tickets ADD CONSTRAINT tickets_barangay_id_fkey
  FOREIGN KEY (barangay_id) REFERENCES barangays(id);

ALTER TABLE reports ADD COLUMN geom geometry(Point, 4326) NOT NULL;
ALTER TABLE reports ADD COLUMN pin_geom geometry(Point, 4326) NOT NULL;
ALTER TABLE reports ADD COLUMN exif_geom geometry(Point, 4326);
CREATE INDEX reports_geom_idx ON reports USING GIST (geom);
CREATE INDEX reports_pin_geom_idx ON reports USING GIST (pin_geom);
