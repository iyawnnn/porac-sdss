// Real migration SQL and real PostGIS. No env file or standalone DB client.
const fs = require('node:fs'),
  path = require('node:path');
const MIGRATIONS = [
  '0001_geometry.sql',
  '0002_reflective_bromley.sql',
  '0003_ratelimit.sql',
  '0003_short_sinister_six.sql',
  '0004_chilly_tarot.sql',
  '0004_ticket_priority_score.sql',
  '0005_ratelimit_citizen.sql',
  '0006_city_boundary_osm.sql',
  '0007_config.sql',
  '0008_exif_data.sql',
  '0009_moderation.sql',
  '0010_resolution.sql',
  '0011_ticket_rejected_flagged.sql',
  '0012_citizen_identities.sql',
  '0013_citizen_account_security.sql',
  '0014_citizen_password_reset.sql',
  '0015_notifications.sql',
  '0016_admin_system_role.sql',
  '0017_admin_created_at.sql',
  '0018_admin_audit_events.sql',
  '0019_admin_password_security.sql',
  '0020_admin_status.sql',
  '0021_work_orders.sql',
  '0022_ticket_disputes.sql',
  '0023_ticket_resolution_confirmation.sql',
  '0024_admin_login_throttle.sql',
  '0025_ticket_report_indexes.sql',
  '0026_citizen_login_signup_rate_limit.sql',
  '0027_work_order_status_history.sql',
  '0028_admin_saved_views.sql',
  '0029_saved_views_surface.sql',
  '0030_admin_focal_role.sql',
  '0031_report_acknowledgments.sql',
  '0032_report_intake_actions.sql',
  '0033_operational_assessments.sql',
  '0034_saved_views_retire_hazard_urgency.sql',
  '0035_categories_manuscript.sql',
  '0036_ticket_report_fields.sql',
  '0037_routing_actions.sql',
  '0038_ticket_acknowledgments.sql',
  '0039_staff_account_types.sql',
  '0040_evidence_flags.sql',
  '0041_severity_screening.sql',
  '0042_resolution_feedback.sql',
  '0043_hazard_information.sql',
  '0044_rainfall_context.sql',
  '0045_assessment_work_orders.sql',
  '0046_resolution_record.sql',
  '0047_audit_append_only.sql',
  '0048_operational_assessment_alignment.sql',
  '0049_phase8b_contraction.sql',
  '0050_report_acknowledgments_contraction.sql',
];
async function demoBaseline(PGlite, postgis, { stopBefore } = {}) {
  if (stopBefore && !MIGRATIONS.includes(stopBefore))
    throw Error('Unknown migration checkpoint: ' + stopBefore);
  const db = new PGlite({ extensions: { postgis } });
  try {
    const root = path.resolve(__dirname, '../../..');
    const migration = (name) =>
      fs.readFileSync(path.join(root, 'api/drizzle', name), 'utf8');
    await db.exec(migration('0000_soft_landau.sql'));
    // Spatial reference DDL lives in these seed sources, not migration SQL.
    // Execute those actual definitions, not alternative fixture table shapes.
    for (const [file, table, index] of [
      ['import-barangays.ts', 'barangays', 'barangays_geom_idx'],
      ['seed-dem.ts', 'dem_points', 'dem_points_geom_idx'],
    ]) {
      const source = fs.readFileSync(
        path.join(root, 'api/scripts/seed', file),
        'utf8',
      );
      for (const prefix of [
        'CREATE TABLE IF NOT EXISTS ' + table,
        'CREATE INDEX IF NOT EXISTS ' + index,
      ]) {
        const start = source.indexOf(prefix),
          end = source.indexOf(String.fromCharCode(96), start);
        if (start < 0 || end < 0)
          throw Error('Reference DDL not found: ' + prefix);
        await db.exec(source.slice(start, end));
      }
    }
    // Historical 0007 computes NOT NULL config bounds from DEM. Reference data
    // must precede it even on an otherwise empty operational database.
    await db.exec(
      'INSERT INTO dem_points(elevation_m,geom) VALUES(100,ST_SetSRID(ST_MakePoint(120.5406,15.0733),4326))',
    );
    for (const name of MIGRATIONS) {
      if (name === stopBefore) break;
      if (name.startsWith('0050')) {
        await db.exec('BEGIN');
        // Canonical empty JSONL is zero bytes. Exercise the real archive guard;
        // this is an in-memory proof, not an archive CLI or a Neon migration.
        await db.query(
          "SELECT set_config('porac.ack_archive_count','0',true),set_config('porac.ack_archive_sha256','e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',true)",
        );
        await db.exec(migration(name));
        await db.exec('COMMIT');
      } else await db.exec(migration(name));
    }
    const barangays = JSON.parse(
      fs.readFileSync(
        path.join(root, 'public/assets/gis/porac_barangays.json'),
        'utf8',
      ),
    );
    for (const f of barangays.features)
      await db.query(
        'INSERT INTO barangays(name,geom) VALUES($1,ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($2),4326)))',
        [f.properties.name, JSON.stringify(f.geometry)],
      );
    const city = JSON.parse(
      fs.readFileSync(
        path.join(root, 'public/assets/gis/porac_osm_boundary.json'),
        'utf8',
      ),
    ).features[0];
    await db.query(
      'INSERT INTO city_boundary_osm(source,geom) VALUES($1,ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($2),4326)))',
      ['Tracked reference boundary', JSON.stringify(city.geometry)],
    );
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}
module.exports = { demoBaseline, MIGRATIONS };
