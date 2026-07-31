-- Full EXIF payload captured alongside the derived exif_captured_at/
-- exif_geom columns, so the admin flagged-report view can show raw EXIF
-- fields without re-parsing the image. Applied via
-- scripts/migrate-exif-data.ts.
ALTER TABLE reports ADD COLUMN IF NOT EXISTS exif_data jsonb;
