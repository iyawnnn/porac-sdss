-- Server-computed config cache: weather cold-start fallback + DEM-derived
-- elevation bounds (lib/config.ts's getElevationBounds(), never recomputed
-- live — see PLAN.md). Applied via scripts/migrate-config.ts, not
-- drizzle-kit, to match the convention for tables added after the initial
-- schema (see 0001/0003/0005/0006).
CREATE TABLE IF NOT EXISTS config (
  key text PRIMARY KEY,
  value text NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  note text
);

INSERT INTO config (key, value, computed_at, note)
VALUES ('rain_1h_mm', '0', now(), 'Cold-start weather cache fallback')
ON CONFLICT (key) DO NOTHING;

INSERT INTO config (key, value, computed_at, note)
SELECT 'elev_min', min(elevation_m)::text, now(), 'DEM-derived minimum elevation'
FROM dem_points
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, computed_at = EXCLUDED.computed_at, note = EXCLUDED.note;

INSERT INTO config (key, value, computed_at, note)
SELECT 'elev_max', max(elevation_m)::text, now(), 'DEM-derived maximum elevation'
FROM dem_points
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, computed_at = EXCLUDED.computed_at, note = EXCLUDED.note;
