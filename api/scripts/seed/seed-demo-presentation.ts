// Dedicated presentation/demo dataset for PORAC-SDSS. Demo-only: every
// derived value (barangay, elevation, office routing, dedup merge,
// member_count, urgency factors, priority_score, urgency_level/band, flags)
// is computed by the same pure functions and SQL patterns the real API
// uses — nothing here hand-writes a score or label. The only things this
// script does that the real system deliberately never lets a caller do are
// listed under "DEMO-ONLY BEHAVIOR" below, and are isolated to this file.
//
// DEMO-ONLY BEHAVIOR:
//   1. Deterministic seed rainfall (rain1hMm passed directly to
//      computeUrgency() per scenario, see RAIN_LOW/RAIN_HIGH below) instead
//      of a live OpenWeatherMap fetch, for every ticket this script itself
//      creates or updates. This alone is NOT enough to keep the live app's
//      own recomputes deterministic afterward — that requires the separate
//      DEMO_FIXED_RAIN_MM env var (api/src/domain/weather.service.ts).
//      Without it, the very next admin Dashboard/Ticket Queue load
//      recomputes every active ticket against live/cached weather again
//      and can silently move seeded HIGH/MEDIUM tickets out of their
//      bands — set DEMO_FIXED_RAIN_MM=30 in api/.env and restart the API
//      before presenting (see that file's comment for the exact revert
//      steps). This script warns at the end if it isn't set.
//   2. Timestamp backdating: every real service call below stamps `now()`,
//      by design (a citizen/admin cannot backdate an action for real) — a
//      final pass shifts created_at/updated_at/status_history.changed_at/
//      reassigned_at/work-order timestamps backward per scenario, after all
//      real logic has already run, preserving the order it produced.
//   3. Email suppression: TicketsService/WorkOrdersService are constructed
//      by hand here with the real ConsoleEmailService (api/src/citizens/
//      email.service.ts) wired directly as the email dependency — bypassing
//      citizens.module.ts's provider factory entirely, so this never
//      selects ResendEmailService even though RESEND_API_KEY is set in this
//      environment. See "Manual service construction" below.
//   4. A demo-only image generator variant (see lib/utils/generate-exif-
//      image.ts's new optional `variant` param) so generated evidence
//      photos get distinct perceptual hashes instead of all colliding —
//      that param is additive/backward-compatible and lives in the shared
//      util, not seed-only, but is otherwise unused by production code.
//
// Nothing here changes: the 50/80 thresholds, the 1/3 urgency weights,
// rainfall normalization, cluster saturation, the priority formula,
// category routing, dedup radii, or containment logic — every one of those
// is imported and called exactly as production does.

import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { sql, db } from '../db';
import {
  generateExifImage,
  renderVariantJpeg,
} from '../../../lib/utils/generate-exif-image';
import { extractExif } from '../lib/exif';
import { computeDHash, hammingDistanceHex } from '../lib/phash';
import { computeUrgency } from '../../../lib/utils/urgency';
import { officeForCategory } from '../../src/common/utils/office';
import { radiusForCategory } from '../../src/common/utils/radius';
import { DUPLICATE_MERGE_WINDOW_DAYS } from '../../src/common/utils/duplicate-detection';
import { haversineMeters } from '../../src/common/utils/distance';
import { TicketsService } from '../../src/admin/tickets.service';
import { WorkOrdersService } from '../../src/admin/work-orders.service';
import { ReportsService } from '../../src/reports/reports.service';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { AdminAuditService } from '../../src/admin/admin-audit.service';
import { ConsoleEmailService } from '../../src/citizens/email.service';
import { recomputeActiveTicketUrgency } from '../lib/recompute';
import type { AdminSession } from '../../src/auth/session.service';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../src/config/env';
import type { WeatherService } from '../../src/domain/weather.service';
import type { MediaService } from '../../src/domain/media.service';
import type { BarangayService } from '../../src/domain/barangay.service';
import type { ElevationService } from '../../src/domain/elevation.service';
import type { AppConfigService } from '../../src/domain/app-config.service';
import type { RateLimitService } from '../../src/domain/ratelimit.service';
import type { RecomputeService } from '../../src/domain/recompute.service';

// ---------------------------------------------------------------------
// Safety guard — fail loudly on anything that doesn't look like a local
// demo database. Mirrors the "fail loudly on unexpected environment"
// requirement; DATABASE_URL is the only signal available to scripts run
// this way, so this checks it isn't obviously a production-named DB.
// ---------------------------------------------------------------------
function assertSafeTarget() {
  const url = process.env.DATABASE_URL ?? '';
  if (!url) throw new Error('DATABASE_URL is not set.');
  if (/\bprod(uction)?\b/i.test(url)) {
    throw new Error(
      `Refusing to run seed:demo-presentation against a database URL that looks production-named:\n${url.replace(/:\/\/[^:]+:[^@]+@/, '://***:***@')}`,
    );
  }
  if (!process.env.ALLOW_DEMO_SEED) {
    throw new Error(
      'Refusing to run: set ALLOW_DEMO_SEED=1 to confirm this points at a disposable demo/dev database. ' +
        'This script TRUNCATEs reports/tickets/notifications and every table that cascades from them.',
    );
  }
}

// ---------------------------------------------------------------------
// Deterministic rainfall. RAIN_HIGH saturates precipitationFactor to 1.0
// (>= 30mm/h per the real, unmodified formula) for MEDIUM/HIGH-target
// scenarios; RAIN_LOW is dry (0mm/h) for LOW-target scenarios. Verified
// against the real computeUrgency() and this environment's real elev_min/
// elev_max/DEM data before committing to this design — see the report
// accompanying this script for the exact numbers. Passed directly as
// computeUrgency()'s rain1hMm argument; the rainfall NORMALIZATION formula
// itself (min(rain/30, 1)) is untouched.
const RAIN_HIGH = 30;
const RAIN_LOW = 0;

// Mirrors the private thresholds in api/src/reports/reports.service.ts's
// submit() flag logic exactly (LOCATION_MISMATCH_THRESHOLD_M,
// STALE_PHOTO_HOURS, DUPLICATE_HAMMING_THRESHOLD) so seed-time flags are
// computed from the same rules, not approximated. Kept in sync by comment
// reference rather than importing them, since those three are module-
// private consts in reports.service.ts, not exported.
const LOCATION_MISMATCH_THRESHOLD_M = 100;
const STALE_PHOTO_HOURS = 24;
const DUPLICATE_HAMMING_THRESHOLD = 10;

const UPLOAD_DIR = resolve(
  __dirname,
  '..',
  '..',
  '..',
  'public',
  'uploads',
  'reports',
);

type TicketStatusTarget =
  'Reported' | 'Under Review' | 'In Progress' | 'Resolved' | 'Rejected';

interface ReportSpec {
  /** citizen email suffix picked round-robin from DEMO_CITIZENS */
  title: string;
  category: string;
  /** offset in meters (roughly) from the cluster anchor point, [dLat,dLng] already pre-scaled to degrees by the caller */
  offsetLat: number;
  offsetLng: number;
  imageKind:
    | 'clean'
    | 'no_exif'
    | 'location_mismatch'
    | 'stale_photo'
    | 'duplicate_a'
    | 'duplicate_b'
    | 'duplicate_a2'
    | 'duplicate_b2';
  variant: number;
}

interface ClusterSpec {
  kind: 'cluster';
  barangay: string;
  category: string;
  targetStatus: TicketStatusTarget;
  ageDays: number;
  reports: ReportSpec[];
  // Overrides the barangay's default point-on-surface as the offset base.
  // Needed when the barangay's own point-on-surface isn't low enough for a
  // HIGH-achievable cluster but a real DEM point elsewhere inside its
  // actual polygon is (verified via a live ST_Contains query, not guessed).
  anchor?: { lat: number; lng: number };
}

interface StandaloneSpec {
  kind: 'standalone';
  barangay: string;
  category: string;
  targetStatus: TicketStatusTarget;
  ageDays: number;
  rain: number;
  report: ReportSpec;
  // Only meaningful when targetStatus is 'Resolved' — applied after status
  // advancement via the real ReportsService.disputeReport/confirmResolution.
  feedback?: { kind: 'dispute'; reason: string } | { kind: 'confirm' };
}

type Spec = ClusterSpec | StandaloneSpec;

const DEMO_CITIZENS = [
  'citizen1@porac.ph',
  'citizen2@porac.ph',
  'citizen3@porac.ph',
  'citizen4@porac.ph',
  'citizen5@porac.ph',
  'citizen6@porac.ph',
  'citizen7@porac.ph',
  'citizen8@porac.ph',
];

// Degrees-per-meter at this latitude (~15°N): 1 deg lat ~= 110,946m,
// 1 deg lng ~= cos(15deg) * 111,320m ~= 107,517m. Close enough for placing
// points a few tens of meters apart for dedup-radius testing.
const M_PER_DEG_LAT = 110_946;
const M_PER_DEG_LNG = 107_517;
function metersToDegLat(m: number) {
  return m / M_PER_DEG_LAT;
}
function metersToDegLng(m: number) {
  return m / M_PER_DEG_LNG;
}

let variantCounter = 100; // clean/no_exif/location_mismatch/stale_photo reports each get a fresh variant; duplicate pairs share one explicitly

function nextVariant() {
  return variantCounter++;
}

// ---------------------------------------------------------------------
// Dataset — 29 barangays, ~53 tickets / ~60 reports. See the accompanying
// report for the full rationale (elevation-verified HIGH placement,
// rain-batching for LOW/MEDIUM, flag distribution).
// ---------------------------------------------------------------------

// Two independent intentional duplicate-image pairs, each pair sharing one
// fixed variant so its two members render byte-identical images (and
// therefore an identical dHash) regardless of anything else about the
// report — everything else (nextVariant()) gets a fresh, distinct pattern.
const DUPLICATE_IMAGE_VARIANTS: Partial<
  Record<ReportSpec['imageKind'], number>
> = {
  duplicate_a: 999,
  duplicate_b: 999,
  duplicate_a2: 998,
  duplicate_b2: 998,
};

function standalone(
  barangay: string,
  category: string,
  targetStatus: TicketStatusTarget,
  ageDays: number,
  rain: number,
  imageKind: ReportSpec['imageKind'] = 'clean',
  title?: string,
  feedback?: StandaloneSpec['feedback'],
): StandaloneSpec {
  return {
    kind: 'standalone',
    barangay,
    category,
    targetStatus,
    ageDays,
    rain,
    report: {
      title: title ?? `${category} report`,
      category,
      offsetLat: 0,
      offsetLng: 0,
      imageKind,
      variant: DUPLICATE_IMAGE_VARIANTS[imageKind] ?? nextVariant(),
    },
    feedback,
  };
}

function cluster(
  barangay: string,
  category: string,
  targetStatus: TicketStatusTarget,
  ageDays: number,
  members: {
    dLatM: number;
    dLngM: number;
    imageKind?: ReportSpec['imageKind'];
  }[],
  anchor?: { lat: number; lng: number },
): ClusterSpec {
  return {
    kind: 'cluster',
    barangay,
    category,
    targetStatus,
    ageDays,
    anchor,
    reports: members.map((m, i) => ({
      title: `${category} report ${i + 1}`,
      category,
      offsetLat: metersToDegLat(m.dLatM),
      offsetLng: metersToDegLng(m.dLngM),
      imageKind: m.imageKind ?? 'clean',
      variant: nextVariant(),
    })),
  };
}

const SPECS: Spec[] = [
  // ---- Dedup clusters (all real ST_DWithin merge logic, real centroid
  // recompute, real member_count increment). Barangays chosen from a real
  // DEM query as the three lowest-elevation candidates so RAIN_HIGH +
  // member_count >= 3 mathematically clears the HIGH threshold — verified
  // via computeUrgency() against this environment's real elev_min/elev_max
  // before being hardcoded here (see script header + accompanying report).
  cluster('San Jose Mitla', 'Pothole / Road Surface Damage', 'In Progress', 1, [
    { dLatM: 0, dLngM: 0 },
    { dLatM: 8, dLngM: 6, imageKind: 'location_mismatch' },
    { dLatM: -6, dLngM: 9 },
  ]),
  cluster(
    'Pulung Santol',
    'Drainage / Culvert / Manhole Issue',
    'Reported',
    3,
    [
      { dLatM: 0, dLngM: 0 },
      { dLatM: 22, dLngM: -5, imageKind: 'stale_photo' },
      { dLatM: -18, dLngM: 12 },
    ],
  ),
  cluster('Salu', 'Localized Flooding', 'Under Review', 4, [
    { dLatM: 0, dLngM: 0 },
    { dLatM: 35, dLngM: 40 },
    { dLatM: -45, dLngM: 20 },
    { dLatM: 10, dLngM: -60, imageKind: 'no_exif' },
  ]),

  // ---- Hotspot: Sapang Uwak (highest-elevation barangay in the dataset —
  // no cluster; deliberately shows a barangay can be "busy" without dedup).
  standalone(
    'Sapang Uwak',
    'Landslide / Slope Failure',
    'In Progress',
    5,
    RAIN_HIGH,
  ),
  standalone(
    'Sapang Uwak',
    'Fallen Tree / Storm-Related Obstruction',
    'Reported',
    1,
    RAIN_HIGH,
  ),
  standalone(
    'Sapang Uwak',
    'Leaking Pipe / Water Supply Concern',
    'Resolved',
    12,
    RAIN_LOW,
  ),
  standalone(
    'Sapang Uwak',
    'Other Minor Infrastructure Hazard',
    'Reported',
    0,
    RAIN_HIGH,
  ),

  // ---- Mid-tier (10 barangays, 2-3 standalone tickets each)
  standalone('Camias', 'Uneven Sidewalk', 'Reported', 2, RAIN_HIGH),
  standalone(
    'Camias',
    'Leaking Pipe / Water Supply Concern',
    'Resolved',
    15,
    RAIN_LOW,
  ),

  standalone(
    'Villa Maria',
    'Landslide / Slope Failure',
    'Under Review',
    6,
    RAIN_HIGH,
  ),
  standalone(
    'Villa Maria',
    'Pothole / Road Surface Damage',
    'Reported',
    1,
    RAIN_HIGH,
    'no_exif',
  ),
  standalone('Villa Maria', 'Streetlight Out', 'Resolved', 20, RAIN_LOW),

  standalone(
    'Inararo',
    'Overgrown Vegetation Obstructing Road or Signage',
    'Reported',
    3,
    RAIN_HIGH,
  ),
  standalone(
    'Inararo',
    'Drainage / Culvert / Manhole Issue',
    'In Progress',
    7,
    RAIN_HIGH,
  ),

  standalone('Pio', 'Localized Flooding', 'Reported', 2, RAIN_HIGH),
  standalone(
    'Pio',
    'Fallen Tree / Storm-Related Obstruction',
    'Reported',
    0,
    RAIN_HIGH,
  ),
  standalone(
    'Pio',
    'Other Minor Infrastructure Hazard',
    'Rejected',
    5,
    RAIN_LOW,
  ),

  standalone(
    'Planas',
    'Pothole / Road Surface Damage',
    'Under Review',
    4,
    RAIN_HIGH,
  ),
  standalone('Planas', 'Streetlight Out', 'Reported', 1, RAIN_HIGH),

  standalone(
    'Palat',
    'Illegal Dumping Affecting Drainage or Road',
    'Reported',
    2,
    RAIN_HIGH,
  ),
  standalone(
    'Palat',
    'Drainage / Culvert / Manhole Issue',
    'In Progress',
    8,
    RAIN_HIGH,
  ),
  standalone('Palat', 'Uneven Sidewalk', 'Resolved', 18, RAIN_LOW),

  standalone(
    'Dolores',
    'Lahar / Debris-Flow Threat',
    'Reported',
    3,
    RAIN_HIGH,
    'location_mismatch',
  ),
  standalone(
    'Dolores',
    'Leaking Pipe / Water Supply Concern',
    'Reported',
    1,
    RAIN_HIGH,
  ),

  standalone(
    'Jalung',
    'Landslide / Slope Failure',
    'In Progress',
    9,
    RAIN_HIGH,
  ),
  standalone(
    'Jalung',
    'Fallen Tree / Storm-Related Obstruction',
    'Reported',
    2,
    RAIN_HIGH,
  ),
  standalone(
    'Jalung',
    'Pothole / Road Surface Damage',
    'Resolved',
    22,
    RAIN_LOW,
  ),

  standalone('Mancatian', 'Streetlight Out', 'Reported', 0, RAIN_HIGH),
  standalone(
    'Mancatian',
    'Overgrown Vegetation Obstructing Road or Signage',
    'Under Review',
    5,
    RAIN_HIGH,
  ),

  standalone(
    'Sinura',
    'Drainage / Culvert / Manhole Issue',
    'Reported',
    3,
    RAIN_HIGH,
  ),
  standalone('Sinura', 'Localized Flooding', 'Reported', 1, RAIN_HIGH),
  standalone(
    'Sinura',
    'Other Minor Infrastructure Hazard',
    'Resolved',
    14,
    RAIN_LOW,
  ),

  // ---- Low-tier (15 barangays, 1 standalone ticket each)
  standalone('Babo Pangulo', 'Streetlight Out', 'Reported', 4, RAIN_HIGH),
  standalone('Babo Sacan', 'Uneven Sidewalk', 'Under Review', 6, RAIN_HIGH),
  standalone(
    'Balubad',
    'Pothole / Road Surface Damage',
    'Reported',
    2,
    RAIN_HIGH,
  ),
  standalone(
    'Calzadang Bayu',
    'Drainage / Culvert / Manhole Issue',
    'Resolved',
    16,
    RAIN_LOW,
  ),
  standalone(
    'Cangatba',
    'Illegal Dumping Affecting Drainage or Road',
    'Reported',
    0,
    RAIN_HIGH,
    'duplicate_a',
  ),
  standalone(
    'Diaz',
    'Other Minor Infrastructure Hazard',
    'Reported',
    1,
    RAIN_HIGH,
    'duplicate_b',
  ),
  standalone(
    'Manibaug Libutad',
    'Streetlight Out',
    'In Progress',
    7,
    RAIN_HIGH,
  ),
  standalone(
    'Manibaug Paralaya',
    'Overgrown Vegetation Obstructing Road or Signage',
    'Reported',
    3,
    RAIN_HIGH,
  ),
  standalone(
    'Manibaug Pasig',
    'Leaking Pipe / Water Supply Concern',
    'Resolved',
    25,
    RAIN_LOW,
  ),
  standalone('Manuali', 'Landslide / Slope Failure', 'Reported', 2, RAIN_HIGH),
  standalone(
    'Mitla Proper',
    'Fallen Tree / Storm-Related Obstruction',
    'Under Review',
    5,
    RAIN_HIGH,
  ),
  standalone('Pias', 'Pothole / Road Surface Damage', 'Resolved', 10, RAIN_LOW),
  standalone(
    'Poblacion',
    'Drainage / Culvert / Manhole Issue',
    'In Progress',
    6,
    RAIN_HIGH,
  ),
  standalone('Sta. Cruz', 'Uneven Sidewalk', 'Reported', 1, RAIN_HIGH),
  standalone('Sepung Bulaon', 'Localized Flooding', 'Reported', 3, RAIN_HIGH),

  // =======================================================================
  // Expansion pass — brings the dataset from ~47/54 to ~88/99 tickets/
  // reports. Reclassifies the 29 barangays into 4 true hotspots (7-10
  // tickets each), 8 medium-activity barangays (3-5 each), and 17
  // low-activity barangays (1-3 each), per the wider-demo requirements.
  // Two more dedup clusters are added (both in already-verified
  // low-elevation hotspot barangays) so HIGH has 5 tickets total instead of
  // relying on a forced score. New Resolved tickets are the pool the
  // dispute/resolution-confirmation scenarios below draw from.
  // =======================================================================

  // ---- Hotspot completion: San Jose Mitla (existing: 1 cluster) -> 7
  cluster(
    'San Jose Mitla',
    'Fallen Tree / Storm-Related Obstruction',
    'Under Review',
    2,
    [
      { dLatM: 0, dLngM: 0 },
      { dLatM: 15, dLngM: -10 },
      { dLatM: -12, dLngM: 14 },
    ],
  ),
  standalone('San Jose Mitla', 'Uneven Sidewalk', 'Reported', 1, RAIN_HIGH),
  standalone(
    'San Jose Mitla',
    'Streetlight Out',
    'Under Review',
    4,
    RAIN_HIGH,
    'location_mismatch',
  ),
  standalone(
    'San Jose Mitla',
    'Overgrown Vegetation Obstructing Road or Signage',
    'In Progress',
    6,
    RAIN_HIGH,
  ),
  standalone(
    'San Jose Mitla',
    'Leaking Pipe / Water Supply Concern',
    'Resolved',
    9,
    RAIN_LOW,
    'clean',
    undefined,
    { kind: 'dispute', reason: 'Pipe still leaking at the same spot.' },
  ),
  standalone(
    'San Jose Mitla',
    'Other Minor Infrastructure Hazard',
    'Resolved',
    11,
    RAIN_HIGH,
    'clean',
    undefined,
    { kind: 'confirm' },
  ),

  // ---- Hotspot completion: Pulung Santol (existing: 1 cluster) -> 7
  cluster('Pulung Santol', 'Landslide / Slope Failure', 'Reported', 1, [
    { dLatM: 0, dLngM: 0 },
    { dLatM: 50, dLngM: -30 },
    { dLatM: -40, dLngM: 35 },
  ]),
  standalone(
    'Pulung Santol',
    'Pothole / Road Surface Damage',
    'Under Review',
    3,
    RAIN_HIGH,
    'duplicate_a2',
  ),
  standalone('Pulung Santol', 'Streetlight Out', 'In Progress', 5, RAIN_HIGH),
  standalone(
    'Pulung Santol',
    'Illegal Dumping Affecting Drainage or Road',
    'Reported',
    0,
    RAIN_HIGH,
  ),
  standalone(
    'Pulung Santol',
    'Leaking Pipe / Water Supply Concern',
    'Resolved',
    13,
    RAIN_LOW,
    'clean',
    undefined,
    {
      kind: 'dispute',
      reason: 'Drainage remains blocked, water still pooling.',
    },
  ),
  standalone(
    'Pulung Santol',
    'Fallen Tree / Storm-Related Obstruction',
    'Resolved',
    17,
    RAIN_HIGH,
    'clean',
    undefined,
    { kind: 'confirm' },
  ),

  // ---- Hotspot completion: Salu (existing: 1 cluster) -> 7
  standalone('Salu', 'Lahar / Debris-Flow Threat', 'Reported', 1, RAIN_HIGH),
  standalone('Salu', 'Landslide / Slope Failure', 'In Progress', 4, RAIN_HIGH),
  standalone(
    'Salu',
    'Pothole / Road Surface Damage',
    'Under Review',
    2,
    RAIN_HIGH,
    'no_exif',
  ),
  standalone('Salu', 'Streetlight Out', 'Reported', 0, RAIN_HIGH),
  standalone(
    'Salu',
    'Drainage / Culvert / Manhole Issue',
    'Resolved',
    19,
    RAIN_LOW,
    'clean',
    undefined,
    { kind: 'dispute', reason: 'Flooding condition not actually addressed.' },
  ),
  standalone(
    'Salu',
    'Other Minor Infrastructure Hazard',
    'Resolved',
    21,
    RAIN_HIGH,
    'clean',
    undefined,
    { kind: 'confirm' },
  ),

  // ---- Hotspot completion: Sapang Uwak (existing: 4 standalone) -> 8
  standalone(
    'Sapang Uwak',
    'Lahar / Debris-Flow Threat',
    'Under Review',
    3,
    RAIN_HIGH,
  ),
  standalone('Sapang Uwak', 'Streetlight Out', 'Reported', 1, RAIN_HIGH),
  standalone(
    'Sapang Uwak',
    'Drainage / Culvert / Manhole Issue',
    'Resolved',
    15,
    RAIN_LOW,
    'clean',
    undefined,
    { kind: 'confirm' },
  ),
  standalone('Sapang Uwak', 'Uneven Sidewalk', 'In Progress', 6, RAIN_HIGH),

  // ---- Medium-activity completion (8 barangays, target 3-5 each)
  standalone(
    'Villa Maria',
    'Fallen Tree / Storm-Related Obstruction',
    'In Progress',
    5,
    RAIN_HIGH,
  ),
  standalone(
    'Villa Maria',
    'Leaking Pipe / Water Supply Concern',
    'Resolved',
    8,
    RAIN_HIGH,
    'clean',
    undefined,
    { kind: 'confirm' },
  ),

  standalone('Pio', 'Landslide / Slope Failure', 'Under Review', 4, RAIN_HIGH),

  standalone('Palat', 'Streetlight Out', 'Under Review', 3, RAIN_HIGH),

  standalone('Jalung', 'Localized Flooding', 'Reported', 1, RAIN_HIGH),

  standalone(
    'Sinura',
    'Landslide / Slope Failure',
    'In Progress',
    6,
    RAIN_HIGH,
  ),

  standalone(
    'Camias',
    'Fallen Tree / Storm-Related Obstruction',
    'Under Review',
    2,
    RAIN_HIGH,
  ),
  standalone('Camias', 'Streetlight Out', 'In Progress', 5, RAIN_HIGH),

  standalone('Inararo', 'Localized Flooding', 'Reported', 1, RAIN_HIGH),
  standalone(
    'Inararo',
    'Pothole / Road Surface Damage',
    'Resolved',
    10,
    RAIN_HIGH,
  ),

  standalone(
    'Planas',
    'Landslide / Slope Failure',
    'In Progress',
    4,
    RAIN_HIGH,
  ),
  standalone(
    'Planas',
    'Leaking Pipe / Water Supply Concern',
    'Resolved',
    12,
    RAIN_LOW,
    'clean',
    undefined,
    { kind: 'dispute', reason: 'Streetlight still not working at night.' },
  ),

  // ---- Low-activity completion (Dolores/Mancatian bumped to 3; five
  // formerly-single barangays bumped to 2)
  standalone(
    'Dolores',
    'Streetlight Out',
    'Resolved',
    7,
    RAIN_HIGH,
    'clean',
    undefined,
    { kind: 'confirm' },
  ),
  standalone('Mancatian', 'Localized Flooding', 'In Progress', 3, RAIN_HIGH),
  standalone(
    'Babo Pangulo',
    'Fallen Tree / Storm-Related Obstruction',
    'Resolved',
    6,
    RAIN_LOW,
    'clean',
    undefined,
    { kind: 'dispute', reason: 'Pothole still visible, not repaved.' },
  ),
  standalone(
    'Babo Sacan',
    'Landslide / Slope Failure',
    'Reported',
    2,
    RAIN_HIGH,
  ),
  standalone('Balubad', 'Localized Flooding', 'In Progress', 5, RAIN_HIGH),
  standalone(
    'Balubad',
    'Fallen Tree / Storm-Related Obstruction',
    'Resolved',
    7,
    RAIN_LOW,
    'clean',
    undefined,
    { kind: 'dispute', reason: 'Flooding condition not actually addressed.' },
  ),
  standalone(
    'Manuali',
    'Drainage / Culvert / Manhole Issue',
    'Resolved',
    9,
    RAIN_HIGH,
    'clean',
    undefined,
    {
      kind: 'dispute',
      reason: 'Drainage remains blocked, water still pooling.',
    },
  ),

  // ---- Manuali expansion: from 2 tickets to 6, including one legitimate
  // HIGH cluster. Manuali's own point-on-surface sits at 625m elevation —
  // too high to ever reach HIGH even at member_count 4 (verified: caps
  // around priority_score 75, MEDIUM). But a real DEM point *inside*
  // Manuali's actual polygon, not just its point-on-surface, sits at 138m
  // (confirmed via a live query against dem_points JOIN barangays ON
  // ST_Contains) — a genuine low-lying pocket, thematically a flood-prone
  // spot in an otherwise highland barangay. A 3-member cluster there is
  // verified (by hand, against the real formula, before writing this) at
  // elevationFactor=0.925, clusterFactor(3)=0.578, rain=30 ->
  // priorityScore ~= 83 -> HIGH, comfortably clear of the 80 threshold.
  cluster(
    'Manuali',
    'Localized Flooding',
    'In Progress',
    3,
    [
      { dLatM: 0, dLngM: 0, imageKind: 'no_exif' },
      { dLatM: 40, dLngM: -25 },
      { dLatM: -30, dLngM: 35 },
    ],
    // Real DEM point confirmed (via ST_Contains against Manuali's actual
    // polygon, not assumed) to sit at 138m — a genuine low-lying pocket in
    // an otherwise highland barangay. See the ClusterSpec comment above.
    { lat: 15.119999999994057, lng: 120.54666666670647 },
  ),
  standalone('Manuali', 'Uneven Sidewalk', 'Reported', 1, RAIN_HIGH),
  standalone(
    'Manuali',
    'Pothole / Road Surface Damage',
    'Resolved',
    11,
    RAIN_LOW,
  ),
  standalone(
    'Manuali',
    'Overgrown Vegetation Obstructing Road or Signage',
    'Under Review',
    4,
    RAIN_HIGH,
  ),
  standalone(
    'Poblacion',
    'Streetlight Out',
    'Under Review',
    2,
    RAIN_HIGH,
    'stale_photo',
  ),

  // Second half of the second duplicate-image pair — shares Pulung
  // Santol's 'Pothole' duplicate_a2 image above via the fixed variant 998,
  // not proximity (different barangay, same category is irrelevant to
  // dHash matching, which only compares image content).
  standalone(
    'Manibaug Libutad',
    'Streetlight Out',
    'In Progress',
    7,
    RAIN_HIGH,
    'duplicate_b2',
  ),

  // =======================================================================
  // HIGH-urgency expansion — 5 more legitimate dedup clusters, bringing the
  // total from 6 to 11 HIGH tickets. Each barangay/member-count pair below
  // was verified against this environment's real elev_min/elev_max and a
  // real DEM point-on-surface lookup *before* being written here (see the
  // accompanying report for the exact computeUrgency() results); none of
  // these five barangays had any prior HIGH representation. Radii,
  // categories, and offsets follow radiusForCategory() exactly — no
  // fabricated geometry. All clean evidence (no flags) and mostly active
  // statuses, per the requirement that HIGH/Needs Attention stay
  // actionable rather than mostly-resolved.
  // =======================================================================

  // Pias (42m) — 25m point-defect tier, MEO. member=3 verified -> 86.
  cluster('Pias', 'Pothole / Road Surface Damage', 'Reported', 1, [
    { dLatM: 0, dLngM: 0 },
    { dLatM: 9, dLngM: -7 },
    { dLatM: -8, dLngM: 6 },
  ]),

  // Balubad (50m) — 50m drainage tier, MEO. member=3 verified -> 85.
  cluster('Balubad', 'Drainage / Culvert / Manhole Issue', 'Under Review', 2, [
    { dLatM: 0, dLngM: 0 },
    { dLatM: 25, dLngM: -15 },
    { dLatM: -20, dLngM: 18 },
  ]),

  // Sepung Bulaon (66m) — 100m surface-area tier, MDRRMO. member=3
  // verified -> 85.
  cluster('Sepung Bulaon', 'Localized Flooding', 'In Progress', 3, [
    { dLatM: 0, dLngM: 0 },
    { dLatM: 55, dLngM: -35 },
    { dLatM: -40, dLngM: 45 },
  ]),

  // Pio (67m) — default 50m tier (not in RADIUS_BY_CATEGORY), MDRRMO.
  // member=3 verified -> 85.
  cluster('Pio', 'Fallen Tree / Storm-Related Obstruction', 'Reported', 1, [
    { dLatM: 0, dLngM: 0 },
    { dLatM: 20, dLngM: 15 },
    { dLatM: -22, dLngM: -10 },
  ]),

  // Mitla Proper (71m) — 100m tier, MDRRMO. member=4 for a touch more
  // margin/variety in cluster size, verified -> 88.
  cluster('Mitla Proper', 'Landslide / Slope Failure', 'Under Review', 2, [
    { dLatM: 0, dLngM: 0 },
    { dLatM: 50, dLngM: -40 },
    { dLatM: -55, dLngM: 30 },
    { dLatM: 15, dLngM: 65 },
  ]),
];

// One manual reassignment: an MDRRMO-direct hazard whose immediate danger
// was cleared, leaving MEO-owned residual road/site work. Chosen after
// creation, not baked into SPECS, so the reassignment goes through the real
// TicketsService.reassignOffice (real office_reassignments row, real audit
// event) rather than being hand-inserted.
const REASSIGN_TARGET = {
  barangay: 'Jalung',
  category: 'Fallen Tree / Storm-Related Obstruction',
};

async function main() {
  assertSafeTarget();
  mkdirSync(UPLOAD_DIR, { recursive: true });

  console.log('--- Resetting operational/demo data ---');
  await resetOperationalData();

  console.log('--- Loading barangays, DEM bounds, admins ---');
  const barangaysByName = await loadBarangays();
  const { elevMin, elevMax } = await loadElevationBounds();
  const citizens = await loadOrCreateCitizens();
  const adminsByOffice = await loadAdmins();

  console.log('--- Seeding reports/tickets ---');
  const createdTickets: {
    id: number;
    barangay: string;
    category: string;
    targetStatus: TicketStatusTarget;
    ageDays: number;
    isCluster: boolean;
    feedback?: StandaloneSpec['feedback'];
    feedbackReportId?: number;
    feedbackCitizenId?: number;
  }[] = [];

  let citizenCursor = 0;
  function nextCitizen() {
    const c = citizens[citizenCursor % citizens.length];
    citizenCursor++;
    return c;
  }

  const flagCounts: Record<string, number> = {};
  const duplicateImageFiles: Record<number, string> = {};

  for (const spec of SPECS) {
    const barangay = barangaysByName.get(spec.barangay);
    if (!barangay)
      throw new Error(`Unknown barangay in spec: ${spec.barangay}`);

    if (spec.kind === 'standalone') {
      const { id, reportId, citizenId, flags } = await createStandaloneTicket({
        barangay,
        category: spec.category,
        rain: spec.rain,
        elevMin,
        elevMax,
        report: spec.report,
        citizenEmail: nextCitizen(),
        duplicateImageFiles,
      });
      for (const f of flags) flagCounts[f] = (flagCounts[f] ?? 0) + 1;
      createdTickets.push({
        id,
        barangay: spec.barangay,
        category: spec.category,
        targetStatus: spec.targetStatus,
        ageDays: spec.ageDays,
        isCluster: false,
        feedback: spec.feedback,
        feedbackReportId: reportId,
        feedbackCitizenId: citizenId,
      });
    } else {
      const { id, flags } = await createClusterTicket({
        barangay: spec.anchor
          ? { id: barangay.id, lat: spec.anchor.lat, lng: spec.anchor.lng }
          : barangay,
        category: spec.category,
        rain: RAIN_HIGH,
        elevMin,
        elevMax,
        reports: spec.reports,
        pickCitizen: nextCitizen,
        duplicateImageFiles,
      });
      for (const f of flags) flagCounts[f] = (flagCounts[f] ?? 0) + 1;
      createdTickets.push({
        id,
        barangay: spec.barangay,
        category: spec.category,
        targetStatus: spec.targetStatus,
        ageDays: spec.ageDays,
        isCluster: true,
      });
    }
  }

  console.log(`Seeded ${createdTickets.length} tickets.`);

  console.log('--- Advancing statuses via real TicketsService ---');
  const ticketsService = buildTicketsService();
  const reassignTicketId = createdTickets.find(
    (t) =>
      t.barangay === REASSIGN_TARGET.barangay &&
      t.category === REASSIGN_TARGET.category,
  )?.id;

  for (const t of createdTickets) {
    const admin = pickAdminForTicket(adminsByOffice, t.category);
    await advanceToTarget(ticketsService, t.id, t.targetStatus, admin);
    if (t.id === reassignTicketId) {
      // assertOfficeAccess requires the acting admin to belong to the
      // ticket's CURRENT office (MDRRMO, before this reassignment) — the
      // MDRRMO officer is the one handing the residual road-repair work
      // off to MEO, not the other way around.
      const mdrrmoAdmin = adminsByOffice.MDRRMO[0];
      await ticketsService.reassignOffice(t.id, mdrrmoAdmin, 'MEO');
      console.log(
        `Reassigned ticket #${t.id} (${t.barangay} / ${t.category}) MDRRMO -> MEO.`,
      );
    }
  }

  console.log('--- Seeding citizen resolution-feedback (dispute/confirm) ---');
  const reportsService = buildReportsService();
  let disputedCount = 0;
  let confirmedCount = 0;
  for (const t of createdTickets) {
    if (
      !t.feedback ||
      t.feedbackReportId === undefined ||
      t.feedbackCitizenId === undefined
    )
      continue;
    if (t.targetStatus !== 'Resolved') {
      throw new Error(
        `Ticket #${t.id} (${t.barangay} / ${t.category}) has a feedback scenario but its targetStatus is ${t.targetStatus}, not Resolved.`,
      );
    }
    if (t.feedback.kind === 'dispute') {
      await reportsService.disputeReport(
        t.feedbackCitizenId,
        t.feedbackReportId,
        t.feedback.reason,
      );
      disputedCount++;
    } else {
      await reportsService.confirmResolution(
        t.feedbackCitizenId,
        t.feedbackReportId,
      );
      confirmedCount++;
    }
  }
  console.log(`Disputed: ${disputedCount}, Confirmed: ${confirmedCount}.`);

  console.log('--- Seeding work orders ---');
  const workOrderIds = await seedWorkOrders(createdTickets, adminsByOffice);

  console.log('--- Backdating timestamps ---');
  await backdateTimestamps(createdTickets);

  console.log(
    "--- Final recompute pass (explicit RAIN_HIGH override, matching this script's own inserts) ---",
  );
  // Only settles this run's own recompute — it does NOT make future admin
  // page loads deterministic. That's DEMO_FIXED_RAIN_MM's job (see header):
  // set it in api/.env and restart the API before presenting, so every
  // subsequent recompute (including this script's own re-runs) reads the
  // same fixed value from WeatherService instead of live/cached weather.
  const recomputeResult = await recomputeActiveTicketUrgency(RAIN_HIGH);
  console.log('Recompute:', recomputeResult);
  if (process.env.DEMO_FIXED_RAIN_MM === undefined) {
    console.warn(
      '\n⚠ DEMO_FIXED_RAIN_MM is not set in this shell. The scores just computed above are correct now, ' +
        'but the next time anyone loads the admin Dashboard/Ticket Queue, the live API process will recompute ' +
        'active tickets against live/cached weather again and can silently move them out of their seeded bands. ' +
        'Set DEMO_FIXED_RAIN_MM=30 in api/.env and restart the API before presenting — see that file for details.\n',
    );
  }

  console.log('--- Verification ---');
  await verifyAndReport(
    createdTickets.map((t) => t.id),
    flagCounts,
    workOrderIds,
  );

  await sql.end();
}

// ---------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------
async function resetOperationalData() {
  // Cascades to status_history, office_reassignments, verifications,
  // work_orders, work_order_status_history automatically (all FK to
  // tickets/reports) — see accompanying report for the verified FK graph.
  await sql`TRUNCATE reports, tickets RESTART IDENTITY CASCADE`;
  // FK-less by design (soft entity_id) — TRUNCATE CASCADE above cannot
  // reach these; clear explicitly so nothing points at a deleted ticket.
  await sql`TRUNCATE notifications RESTART IDENTITY`;
  await sql`DELETE FROM admin_audit_events WHERE target_type IN ('ticket', 'report', 'work_order')`;
}

// ---------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------
async function loadBarangays() {
  const rows = await sql<
    { id: number; name: string; lat: number; lng: number }[]
  >`
    SELECT id, name, ST_Y(ST_PointOnSurface(geom)) AS lat, ST_X(ST_PointOnSurface(geom)) AS lng
    FROM barangays
  `;
  if (rows.length !== 29) {
    console.warn(`Warning: expected 29 barangays, found ${rows.length}.`);
  }
  return new Map(rows.map((r) => [r.name, r]));
}

async function loadElevationBounds() {
  const rows = await sql<{ key: string; value: string }[]>`
    SELECT key, value FROM config WHERE key IN ('elev_min', 'elev_max')
  `;
  const map = Object.fromEntries(rows.map((r) => [r.key, Number(r.value)]));
  if (map.elev_min === undefined || map.elev_max === undefined) {
    throw new Error(
      "config table is missing elev_min/elev_max — run 'pnpm --prefix api seed:dem' first.",
    );
  }
  return { elevMin: map.elev_min, elevMax: map.elev_max };
}

async function loadOrCreateCitizens(): Promise<string[]> {
  const existing = await sql<{ email: string }[]>`
    SELECT email FROM citizens WHERE email = ANY(${DEMO_CITIZENS})
  `;
  const existingSet = new Set(existing.map((r) => r.email));
  const missing = DEMO_CITIZENS.filter((e) => !existingSet.has(e));
  for (const email of missing) {
    const n = email.replace('@porac.ph', '').replace('citizen', '');
    await sql`
      INSERT INTO citizens (email, first_name, last_name)
      VALUES (${email}, ${`Demo`}, ${`Citizen ${n}`})
      ON CONFLICT (email) DO NOTHING
    `;
  }
  if (missing.length > 0)
    console.log(
      `Created ${missing.length} additional demo citizen account(s).`,
    );
  return DEMO_CITIZENS;
}

async function loadAdmins() {
  const rows = await sql<
    {
      id: number;
      email: string;
      first_name: string;
      last_name: string;
      office: 'MEO' | 'MDRRMO' | null;
      role: string;
    }[]
  >`
    SELECT id, email, first_name, last_name, office, role
    FROM admins WHERE is_active = true
  `;
  const meo = rows.filter((r) => r.office === 'MEO');
  const mdrrmo = rows.filter((r) => r.office === 'MDRRMO');
  if (meo.length === 0 || mdrrmo.length === 0) {
    throw new Error(
      'Need at least one active MEO admin and one active MDRRMO admin already seeded (pnpm --prefix api seed:admin ...) before running this script.',
    );
  }
  const toSession = (r: (typeof rows)[number]): AdminSession => ({
    adminId: r.id,
    email: r.email,
    adminName: `${r.first_name} ${r.last_name}`,
    office: r.office,
    role: r.role as AdminSession['role'],
  });
  return { MEO: meo.map(toSession), MDRRMO: mdrrmo.map(toSession) };
}

function pickAdminForTicket(
  adminsByOffice: { MEO: AdminSession[]; MDRRMO: AdminSession[] },
  category: string,
): AdminSession {
  const office = officeForCategory(category);
  const list = adminsByOffice[office];
  return list[0];
}

// ---------------------------------------------------------------------
// Real barangay containment (mirrors BarangayService.findBarangayForPoint)
// ---------------------------------------------------------------------
async function resolveBarangayForPoint(
  lat: number,
  lng: number,
): Promise<{ id: number; name: string; viaFallback: boolean }> {
  const [exact] = await sql<{ id: number; name: string }[]>`
    SELECT id, name FROM barangays WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)) LIMIT 1
  `;
  if (exact) return { ...exact, viaFallback: false };

  const [inCity] = await sql<{ in_city: boolean }[]>`
    SELECT ST_Contains(geom, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)) AS in_city FROM city_boundary_osm LIMIT 1
  `;
  if (!inCity?.in_city) {
    throw new Error(
      `Point (${lat}, ${lng}) is outside the municipality entirely — cannot seed here.`,
    );
  }
  const [nearest] = await sql<{ id: number; name: string }[]>`
    SELECT id, name FROM barangays
    ORDER BY geom <-> ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326) LIMIT 1
  `;
  return { ...nearest, viaFallback: true };
}

async function findNearestElevation(lat: number, lng: number): Promise<number> {
  const [row] = await sql<{ elevation_m: number }[]>`
    SELECT elevation_m FROM dem_points
    ORDER BY geom <-> ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326) LIMIT 1
  `;
  return row.elevation_m;
}

// ---------------------------------------------------------------------
// Evidence image + flag computation (mirrors ReportsService.submit exactly)
// ---------------------------------------------------------------------
async function buildEvidence({
  reportId,
  lat,
  lng,
  imageKind,
  variant,
  duplicateImageFiles,
}: {
  reportId: number; // provisional index used only for the filename, not a DB id
  lat: number;
  lng: number;
  imageKind: ReportSpec['imageKind'];
  variant: number;
  duplicateImageFiles: Record<number, string>;
}) {
  const filename = `demo_${reportId}.jpg`;
  const filePath = resolve(UPLOAD_DIR, filename);
  const imageUrl = `/uploads/reports/${filename}`;

  let exifLat = lat;
  let exifLng = lng;
  let exifDate = new Date();
  let skipExif = false;

  if (imageKind === 'location_mismatch') {
    // Push the EXIF GPS well past LOCATION_MISMATCH_THRESHOLD_M (100m).
    exifLat = lat + metersToDegLat(180);
    exifLng = lng + metersToDegLng(180);
  } else if (imageKind === 'stale_photo') {
    exifDate = new Date(Date.now() - (STALE_PHOTO_HOURS + 6) * 60 * 60 * 1000);
  } else if (imageKind === 'no_exif') {
    skipExif = true;
  }

  if (skipExif) {
    // Still the variant-patterned image (so it doesn't collide with every
    // other NO_EXIF report on the same all-zero flat-fill hash) — just
    // rendered with no piexif injection at all, so extractExif finds no GPS.
    const jpeg = await renderVariantJpeg(variant);
    writeFileSync(filePath, jpeg);
  } else {
    await generateExifImage({
      outputPath: filePath,
      lat: exifLat,
      lng: exifLng,
      date: exifDate,
      variant,
    });
  }

  const buffer = readFileSync(filePath);
  const exif = await extractExif(buffer);
  const phash = await computeDHash(buffer);

  const flags: string[] = [];
  let locationMismatchM: number | null = null;

  if (exif.lat === null || exif.lng === null) {
    flags.push('NO_EXIF');
  } else {
    locationMismatchM = haversineMeters(lat, lng, exif.lat, exif.lng);
    if (locationMismatchM > LOCATION_MISMATCH_THRESHOLD_M)
      flags.push('LOCATION_MISMATCH');
  }
  if (exif.capturedAt) {
    const ageHours =
      (Date.now() - exif.capturedAt.getTime()) / (1000 * 60 * 60);
    if (ageHours > STALE_PHOTO_HOURS) flags.push('STALE_PHOTO');
  }

  if (phash !== null) {
    for (const [priorReportId, priorHash] of Object.entries(
      duplicateImageFiles,
    )) {
      if (hammingDistanceHex(phash, priorHash) <= DUPLICATE_HAMMING_THRESHOLD) {
        flags.push(`DUPLICATE_IMAGE:${priorReportId}`);
        break;
      }
    }
  }

  return {
    imageUrl,
    exif,
    phash,
    flags,
    locationMismatchM,
    exifCapturedAtIso:
      exif.capturedAt?.toISOString() ?? new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------
// Standalone ticket creation (no merge candidate expected)
// ---------------------------------------------------------------------
async function createStandaloneTicket({
  barangay,
  category,
  rain,
  elevMin,
  elevMax,
  report,
  citizenEmail,
  duplicateImageFiles,
}: {
  barangay: { id: number; lat: number; lng: number };
  category: string;
  rain: number;
  elevMin: number;
  elevMax: number;
  report: ReportSpec;
  citizenEmail: string;
  duplicateImageFiles: Record<number, string>;
}): Promise<{
  id: number;
  reportId: number;
  citizenId: number;
  flags: string[];
}> {
  const lat = barangay.lat + report.offsetLat;
  const lng = barangay.lng + report.offsetLng;
  const resolved = await resolveBarangayForPoint(lat, lng);
  const elevationM = await findNearestElevation(lat, lng);
  const office = officeForCategory(category);
  const urgency = computeUrgency({
    elevationM,
    elevMin,
    elevMax,
    memberCount: 1,
    rain1hMm: rain,
  });

  const [citizen] = await sql<
    { id: number }[]
  >`SELECT id FROM citizens WHERE email = ${citizenEmail}`;

  const [ticket] = await sql<{ id: number }[]>`
    INSERT INTO tickets (
      category, barangay_id, status, member_count, elevation_m, assigned_office, geom,
      elevation_factor, precipitation_factor, cluster_factor, urgency_score, urgency_band,
      priority_score, urgency_level
    ) VALUES (
      ${category}, ${resolved.id}, 'Reported', 1, ${elevationM}, ${office},
      ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326),
      ${urgency.elevationFactor}, ${urgency.precipitationFactor}, ${urgency.clusterFactor},
      ${urgency.urgencyScore}, ${urgency.urgencyBand}, ${urgency.priorityScore}, ${urgency.urgencyLevel}
    ) RETURNING id
  `;

  const evidence = await buildEvidence({
    reportId: ticket.id,
    lat,
    lng,
    imageKind: report.imageKind,
    variant: report.variant,
    duplicateImageFiles,
  });
  if (evidence.phash) duplicateImageFiles[ticket.id] = evidence.phash;

  const flagged = evidence.flags.length > 0;

  const [insertedReport] = await sql<{ id: number }[]>`
    INSERT INTO reports (
      ticket_id, citizen_id, title, description, citizen_severity, elevation_m, image_url,
      geom, pin_geom, exif_geom, exif_captured_at, exif_data, image_phash, location_mismatch_m, flags
    ) VALUES (
      ${ticket.id}, ${citizen.id}, ${report.title}, 'Demo presentation report', 'Medium', ${elevationM}, ${evidence.imageUrl},
      ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326), ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326),
      ${evidence.exif.lat !== null ? sql`ST_SetSRID(ST_MakePoint(${evidence.exif.lng}, ${evidence.exif.lat}), 4326)` : sql`NULL`},
      ${evidence.exifCapturedAtIso}, ${JSON.stringify(evidence.exif.data)}::jsonb, ${evidence.phash}, ${evidence.locationMismatchM}, ${evidence.flags}
    ) RETURNING id
  `;

  if (flagged) {
    await sql`UPDATE tickets SET flagged = true WHERE id = ${ticket.id}`;
  }

  return {
    id: ticket.id,
    reportId: insertedReport.id,
    citizenId: citizen.id,
    flags: evidence.flags,
  };
}

// ---------------------------------------------------------------------
// Dedup cluster creation — real ST_DWithin merge query per report, real
// centroid recompute, real member_count increment. Mirrors
// ReportsService.submit's merge branch (minus the advisory lock, which
// only matters under real concurrency — this script runs single-threaded).
// ---------------------------------------------------------------------
async function createClusterTicket({
  barangay,
  category,
  rain,
  elevMin,
  elevMax,
  reports,
  pickCitizen,
  duplicateImageFiles,
}: {
  barangay: { id: number; lat: number; lng: number };
  category: string;
  rain: number;
  elevMin: number;
  elevMax: number;
  reports: ReportSpec[];
  pickCitizen: () => string;
  duplicateImageFiles: Record<number, string>;
}): Promise<{ id: number; flags: string[] }> {
  const office = officeForCategory(category);
  const radius = radiusForCategory(category);
  let ticketId: number | null = null;
  const allFlags: string[] = [];

  for (const report of reports) {
    const lat = barangay.lat + report.offsetLat;
    const lng = barangay.lng + report.offsetLng;
    const resolved = await resolveBarangayForPoint(lat, lng);
    const elevationM = await findNearestElevation(lat, lng);
    const citizenEmail = pickCitizen();
    const [citizen] = await sql<
      { id: number }[]
    >`SELECT id FROM citizens WHERE email = ${citizenEmail}`;

    const evidence = await buildEvidence({
      reportId: report.variant,
      lat,
      lng,
      imageKind: report.imageKind,
      variant: report.variant,
      duplicateImageFiles,
    });

    const [existing] = ticketId
      ? await sql<{ id: number; member_count: number }[]>`
          SELECT id, member_count FROM tickets
          WHERE id = ${ticketId}
            AND status IN ('Reported', 'Under Review', 'In Progress')
            AND created_at > now() - make_interval(days => ${DUPLICATE_MERGE_WINDOW_DAYS})
            AND ST_DWithin(
              geom::geography,
              ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
              ${radius}
            )
        `
      : [];

    if (existing) {
      await sql`
        INSERT INTO reports (
          ticket_id, citizen_id, title, description, citizen_severity, elevation_m, image_url,
          geom, pin_geom, exif_geom, exif_captured_at, exif_data, image_phash, location_mismatch_m, flags
        ) VALUES (
          ${existing.id}, ${citizen.id}, ${report.title}, 'Demo presentation report (cluster member)', 'High', ${elevationM}, ${evidence.imageUrl},
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326), ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326),
          ${evidence.exif.lat !== null ? sql`ST_SetSRID(ST_MakePoint(${evidence.exif.lng}, ${evidence.exif.lat}), 4326)` : sql`NULL`},
          ${evidence.exifCapturedAtIso}, ${JSON.stringify(evidence.exif.data)}::jsonb, ${evidence.phash}, ${evidence.locationMismatchM}, ${evidence.flags}
        )
      `;
      const memberCount = existing.member_count + 1;
      const [centroid] = await sql<{ lat: number; lng: number }[]>`
        SELECT ST_Y(c) AS lat, ST_X(c) AS lng FROM (
          SELECT ST_Centroid(ST_Collect(geom)) AS c FROM reports WHERE ticket_id = ${existing.id}
        ) t
      `;
      const ticketElevationM = await findNearestElevation(
        centroid.lat,
        centroid.lng,
      );
      const urgency = computeUrgency({
        elevationM: ticketElevationM,
        elevMin,
        elevMax,
        memberCount,
        rain1hMm: rain,
      });
      await sql`
        UPDATE tickets SET
          member_count = ${memberCount},
          geom = ST_SetSRID(ST_MakePoint(${centroid.lng}, ${centroid.lat}), 4326),
          elevation_m = ${ticketElevationM},
          elevation_factor = ${urgency.elevationFactor},
          precipitation_factor = ${urgency.precipitationFactor},
          cluster_factor = ${urgency.clusterFactor},
          urgency_score = ${urgency.urgencyScore},
          urgency_band = ${urgency.urgencyBand},
          priority_score = ${urgency.priorityScore},
          urgency_level = ${urgency.urgencyLevel},
          updated_at = now()
        WHERE id = ${existing.id}
      `;
    } else {
      const urgency = computeUrgency({
        elevationM,
        elevMin,
        elevMax,
        memberCount: 1,
        rain1hMm: rain,
      });
      const [created] = await sql<{ id: number }[]>`
        INSERT INTO tickets (
          category, barangay_id, status, member_count, elevation_m, assigned_office, geom,
          elevation_factor, precipitation_factor, cluster_factor, urgency_score, urgency_band,
          priority_score, urgency_level
        ) VALUES (
          ${category}, ${resolved.id}, 'Reported', 1, ${elevationM}, ${office},
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326),
          ${urgency.elevationFactor}, ${urgency.precipitationFactor}, ${urgency.clusterFactor},
          ${urgency.urgencyScore}, ${urgency.urgencyBand}, ${urgency.priorityScore}, ${urgency.urgencyLevel}
        ) RETURNING id
      `;
      ticketId = created.id;
      await sql`
        INSERT INTO reports (
          ticket_id, citizen_id, title, description, citizen_severity, elevation_m, image_url,
          geom, pin_geom, exif_geom, exif_captured_at, exif_data, image_phash, location_mismatch_m, flags
        ) VALUES (
          ${ticketId}, ${citizen.id}, ${report.title}, 'Demo presentation report (cluster anchor)', 'High', ${elevationM}, ${evidence.imageUrl},
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326), ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326),
          ${evidence.exif.lat !== null ? sql`ST_SetSRID(ST_MakePoint(${evidence.exif.lng}, ${evidence.exif.lat}), 4326)` : sql`NULL`},
          ${evidence.exifCapturedAtIso}, ${JSON.stringify(evidence.exif.data)}::jsonb, ${evidence.phash}, ${evidence.locationMismatchM}, ${evidence.flags}
        )
      `;
    }

    if (evidence.phash) duplicateImageFiles[report.variant] = evidence.phash;
    allFlags.push(...evidence.flags);
  }

  if (!ticketId)
    throw new Error(
      `Cluster for ${category} in ${barangay.id} never created an anchor ticket.`,
    );
  if (allFlags.length > 0)
    await sql`UPDATE tickets SET flagged = true WHERE id = ${ticketId}`;

  return { id: ticketId, flags: allFlags };
}

// ---------------------------------------------------------------------
// Manual service construction — real NotificationsService/AdminAuditService
// (both take only a Drizzle db handle), real ConsoleEmailService (bypasses
// citizens.module.ts's Resend-selecting factory entirely — see header),
// stub WeatherService/MediaService (structurally unreachable from
// advanceStatus/rejectTicket/reassignOffice as long as no resolution photo
// buffer is passed, which this script never does).
// ---------------------------------------------------------------------
function buildTicketsService(): TicketsService {
  const notifications = new NotificationsService(db);
  const audit = new AdminAuditService(db);
  const email = new ConsoleEmailService({
    get: () => 'development',
  } as unknown as ConfigService<Env, true>);
  const config = {
    get: () => 'http://localhost:3000',
  } as unknown as ConfigService<Env, true>;
  return new TicketsService(
    sql,
    {} as WeatherService,
    {} as MediaService,
    notifications,
    email,
    config,
    audit,
  );
}

// disputeReport/confirmResolution only ever touch this.pg and (dispute
// only) this.notifications — verified by reading both method bodies before
// wiring this. The other six ReportsService dependencies (barangay,
// elevation, appConfig, weather, media, rateLimit, recompute) all belong to
// submit(), which this script never calls through the real service (see
// header: submit() forces a Cloudinary upload and real rate-limit checks
// with no override, which is why report/ticket creation above replicates
// its SQL directly instead).
function buildReportsService(): ReportsService {
  const notifications = new NotificationsService(db);
  return new ReportsService(
    sql,
    {} as BarangayService,
    {} as ElevationService,
    {} as AppConfigService,
    {} as WeatherService,
    {} as MediaService,
    {} as RateLimitService,
    {} as RecomputeService,
    notifications,
  );
}

function buildWorkOrdersService(): WorkOrdersService {
  const notifications = new NotificationsService(db);
  const audit = new AdminAuditService(db);
  return new WorkOrdersService(db, notifications, audit);
}

const STATUS_LADDER: TicketStatusTarget[] = [
  'Reported',
  'Under Review',
  'In Progress',
  'Resolved',
];

async function advanceToTarget(
  ticketsService: TicketsService,
  ticketId: number,
  target: TicketStatusTarget,
  admin: AdminSession,
) {
  if (target === 'Rejected') {
    await ticketsService.rejectTicket(
      ticketId,
      admin,
      'Not within scope of MEO/MDRRMO direct responsibility for this demo scenario.',
    );
    return;
  }
  const targetIndex = STATUS_LADDER.indexOf(target);
  for (let i = 1; i <= targetIndex; i++) {
    await ticketsService.advanceStatus(ticketId, admin, undefined, undefined);
  }
}

// ---------------------------------------------------------------------
// Work orders — real WorkOrdersService, one active + one completed, tied
// to two of the In Progress tickets created above.
// ---------------------------------------------------------------------
async function seedWorkOrders(
  createdTickets: {
    id: number;
    targetStatus: TicketStatusTarget;
    category: string;
  }[],
  adminsByOffice: { MEO: AdminSession[]; MDRRMO: AdminSession[] },
): Promise<number[]> {
  const inProgress = createdTickets.filter(
    (t) => t.targetStatus === 'In Progress',
  );
  if (inProgress.length < 4) {
    console.warn(
      `Only ${inProgress.length} In Progress tickets available — need 4 for a full pending/in_progress/in_progress/completed mix. Seeding as many as possible.`,
    );
  }
  const workOrdersService = buildWorkOrdersService();
  const ids: number[] = [];

  async function makeWorkOrder(
    ticket: { id: number; category: string },
    title: string,
    finalStatus: 'pending' | 'in_progress' | 'completed',
  ) {
    const admin = pickAdminForTicket(adminsByOffice, ticket.category);
    const wo = await workOrdersService.create(
      {
        ticketId: ticket.id,
        title,
        notes: `Demo ${finalStatus} work order.`,
        assignedAdminId: admin.adminId,
        dueDate: null,
      },
      admin,
    );
    if (finalStatus === 'in_progress' || finalStatus === 'completed') {
      await workOrdersService.setStatus(wo.id, 'in_progress', admin);
    }
    if (finalStatus === 'completed') {
      await workOrdersService.setStatus(wo.id, 'completed', admin);
    }
    ids.push(wo.id);
    console.log(
      `Seeded work order #${wo.id} (${finalStatus}) for ticket #${ticket.id}.`,
    );
  }

  const targets = inProgress.slice(0, 4);
  const statuses: ('pending' | 'in_progress' | 'completed')[] = [
    'pending',
    'in_progress',
    'in_progress',
    'completed',
  ];
  const titles = [
    'Site assessment scheduled',
    'Field crew dispatched for repair',
    'Field crew dispatched for repair',
    'Site cleanup and repair',
  ];
  for (let i = 0; i < targets.length; i++) {
    await makeWorkOrder(targets[i], titles[i], statuses[i]);
  }

  return ids;
}

// ---------------------------------------------------------------------
// Timestamp backdating — DEMO-ONLY. Shifts every real-service-stamped
// `now()` on a ticket (and its reports/status_history/office_reassignments/
// work_orders/work_order_status_history) backward by the spec's ageDays,
// preserving whatever relative order the real sequence of calls produced.
// Never touches urgency_score/priority_score/urgency_level/urgency_band/
// elevation_factor/precipitation_factor/cluster_factor/priority_index —
// those stay exactly as real computeUrgency()/computePriorityIndex() set
// them.
// ---------------------------------------------------------------------
async function backdateTimestamps(
  createdTickets: {
    id: number;
    ageDays: number;
    feedback?: StandaloneSpec['feedback'];
  }[],
) {
  for (const t of createdTickets) {
    if (t.ageDays <= 0) continue;
    const days = t.ageDays;
    await sql`UPDATE tickets SET created_at = created_at - make_interval(days => ${days}), updated_at = updated_at - make_interval(days => ${days}), disputed_at = disputed_at - make_interval(days => ${days}), resolution_confirmed_at = resolution_confirmed_at - make_interval(days => ${days}) WHERE id = ${t.id}`;
    await sql`UPDATE reports SET created_at = created_at - make_interval(days => ${days}) WHERE ticket_id = ${t.id}`;
    await sql`UPDATE status_history SET changed_at = changed_at - make_interval(days => ${days}) WHERE ticket_id = ${t.id}`;
    await sql`UPDATE office_reassignments SET reassigned_at = reassigned_at - make_interval(days => ${days}) WHERE ticket_id = ${t.id}`;
    await sql`
      UPDATE work_order_status_history SET changed_at = changed_at - make_interval(days => ${days})
      WHERE work_order_id IN (SELECT id FROM work_orders WHERE ticket_id = ${t.id})
    `;
    await sql`
      UPDATE work_orders SET created_at = created_at - make_interval(days => ${days}), updated_at = updated_at - make_interval(days => ${days}),
        completed_at = CASE WHEN completed_at IS NOT NULL THEN completed_at - make_interval(days => ${days}) ELSE NULL END
      WHERE ticket_id = ${t.id}
    `;

    // Realistic feedback lag: a citizen notices a few days after resolution,
    // not seconds after (which is all real wall-clock time separates them
    // by, before this nudge). Shifted forward from the just-backdated
    // resolved moment rather than left at "resolved_at plus a few seconds"
    // — every ageDays used with a feedback scenario is >= 6, so this can
    // never land in the future.
    if (t.feedback) {
      const lagDays = 2;
      if (t.feedback.kind === 'dispute') {
        await sql`UPDATE tickets SET disputed_at = disputed_at + make_interval(days => ${lagDays}) WHERE id = ${t.id}`;
      } else {
        await sql`UPDATE tickets SET resolution_confirmed_at = resolution_confirmed_at + make_interval(days => ${lagDays}) WHERE id = ${t.id}`;
      }
    }
  }
}

// ---------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------
async function verifyAndReport(
  ticketIds: number[],
  flagCounts: Record<string, number>,
  workOrderIds: number[],
) {
  const failures: string[] = [];

  const barangayCoverage = await sql<{ name: string; count: number }[]>`
    SELECT b.name, COUNT(t.id)::int AS count
    FROM barangays b LEFT JOIN tickets t ON t.barangay_id = b.id
    GROUP BY b.name ORDER BY b.name
  `;
  const uncovered = barangayCoverage.filter((b) => b.count === 0);
  if (uncovered.length > 0)
    failures.push(
      `Barangays with zero tickets: ${uncovered.map((b) => b.name).join(', ')}`,
    );

  const byBand = await sql<{ urgency_level: string | null; count: number }[]>`
    SELECT urgency_level, COUNT(*)::int AS count FROM tickets GROUP BY urgency_level
  `;
  const bandMap = Object.fromEntries(
    byBand.map((r) => [r.urgency_level ?? 'NULL', r.count]),
  );
  const BAND_MINIMUMS = { LOW: 8, MEDIUM: 15 };
  for (const [band, minimum] of Object.entries(BAND_MINIMUMS)) {
    if (!bandMap[band] || bandMap[band] < minimum)
      failures.push(
        `Urgency band ${band} has fewer than ${minimum} tickets (${bandMap[band] ?? 0}).`,
      );
  }
  // HIGH has an exact target range (not just a floor) this round: 10-12.
  if (!bandMap.HIGH || bandMap.HIGH < 10 || bandMap.HIGH > 12) {
    failures.push(`Expected 10-12 HIGH tickets, found ${bandMap.HIGH ?? 0}.`);
  }

  const byStatus = await sql<{ status: string; count: number }[]>`
    SELECT status, COUNT(*)::int AS count FROM tickets GROUP BY status
  `;
  const statusMap = Object.fromEntries(
    byStatus.map((r) => [r.status, r.count]),
  );
  for (const status of [
    'Reported',
    'Under Review',
    'In Progress',
    'Resolved',
  ]) {
    if (!statusMap[status]) failures.push(`Status ${status} has zero tickets.`);
  }

  const byOffice = await sql<{ assigned_office: string; count: number }[]>`
    SELECT assigned_office, COUNT(*)::int AS count FROM tickets GROUP BY assigned_office
  `;
  const officeMap = Object.fromEntries(
    byOffice.map((r) => [r.assigned_office, r.count]),
  );
  if (!officeMap.MEO) failures.push('MEO has zero tickets.');
  if (!officeMap.MDRRMO) failures.push('MDRRMO has zero tickets.');

  const clusters = await sql<
    { id: number; member_count: number; category: string }[]
  >`
    SELECT id, member_count, category FROM tickets WHERE member_count > 1 ORDER BY id
  `;
  if (clusters.length < 11)
    failures.push(
      `Expected at least 11 dedup clusters (member_count > 1), found ${clusters.length}.`,
    );

  // ---- HIGH-ticket table + targeted assertions ----
  const highTickets = await sql<
    {
      id: number;
      barangay: string;
      category: string;
      assigned_office: string;
      status: string;
      elevation_m: number | null;
      member_count: number;
      elevation_factor: number | null;
      precipitation_factor: number | null;
      cluster_factor: number | null;
      priority_score: number | null;
    }[]
  >`
    SELECT t.id, b.name AS barangay, t.category, t.assigned_office, t.status,
      t.elevation_m, t.member_count, t.elevation_factor, t.precipitation_factor,
      t.cluster_factor, t.priority_score
    FROM tickets t JOIN barangays b ON b.id = t.barangay_id
    WHERE t.urgency_level = 'HIGH'
    ORDER BY t.priority_score DESC
  `;
  for (const h of highTickets) {
    if (h.priority_score === null || h.priority_score < 80) {
      failures.push(
        `HIGH ticket #${h.id} (${h.barangay}) has priority_score ${h.priority_score}, expected >= 80.`,
      );
    }
    if (h.member_count <= 1) {
      failures.push(
        `HIGH ticket #${h.id} (${h.barangay}) has member_count ${h.member_count} — HIGH must come from a real cluster.`,
      );
    }
  }
  const highOffices = new Set(highTickets.map((h) => h.assigned_office));
  if (!highOffices.has('MEO'))
    failures.push('No HIGH ticket is assigned to MEO.');
  if (!highOffices.has('MDRRMO'))
    failures.push('No HIGH ticket is assigned to MDRRMO.');
  const highBarangays = new Set(highTickets.map((h) => h.barangay));
  if (highBarangays.size < 5) {
    failures.push(
      `HIGH tickets span only ${highBarangays.size} barangay(s), expected several.`,
    );
  }

  const scoreRange = await sql<{ min: number | null; max: number | null }[]>`
    SELECT MIN(priority_score) AS min, MAX(priority_score) AS max FROM tickets WHERE priority_score IS NOT NULL
  `;
  if (scoreRange[0].min !== null && scoreRange[0].min < 0)
    failures.push(`A priority_score fell below 0 (${scoreRange[0].min}).`);
  if (scoreRange[0].max !== null && scoreRange[0].max > 100)
    failures.push(`A priority_score exceeded 100 (${scoreRange[0].max}).`);

  const KNOWN_FLAG_PREFIXES = [
    'NO_EXIF',
    'LOCATION_MISMATCH',
    'STALE_PHOTO',
    'DUPLICATE_IMAGE',
    'BOUNDARY_FALLBACK',
  ];
  const allFlags = await sql<
    { flags: string[] }[]
  >`SELECT flags FROM reports WHERE flags IS NOT NULL AND array_length(flags, 1) > 0`;
  const unsupported = new Set<string>();
  for (const row of allFlags) {
    for (const f of row.flags) {
      if (!KNOWN_FLAG_PREFIXES.some((p) => f === p || f.startsWith(`${p}:`)))
        unsupported.add(f);
    }
  }
  if (unsupported.size > 0)
    failures.push(
      `Unsupported/invented flags found: ${[...unsupported].join(', ')}`,
    );

  const duplicateFlagged = await sql<{ id: number; flags: string[] }[]>`
    SELECT id, flags FROM reports WHERE EXISTS (SELECT 1 FROM unnest(flags) f WHERE f LIKE 'DUPLICATE_IMAGE%')
  `;
  // Exactly one report per intentional pair should ever carry
  // DUPLICATE_IMAGE: the second half of each pair (the first has nothing
  // preceding it to match). Two pairs are seeded now, so exactly 2 is
  // expected. More than that means an unrelated "clean" report accidentally
  // collided under dHash.
  if (duplicateFlagged.length !== 2) {
    failures.push(
      `Expected exactly 2 reports flagged DUPLICATE_IMAGE (the two intentional pairs), found ${duplicateFlagged.length}: ${duplicateFlagged.map((r) => r.id).join(', ')}`,
    );
  }

  // ---- Barangay tier coverage (4 hotspots >= 7 tickets each) ----
  const HOTSPOTS = ['San Jose Mitla', 'Pulung Santol', 'Salu', 'Sapang Uwak'];
  const barangayByName = Object.fromEntries(
    barangayCoverage.map((b) => [b.name, b.count]),
  );
  for (const name of HOTSPOTS) {
    if ((barangayByName[name] ?? 0) < 7) {
      failures.push(
        `Hotspot barangay ${name} has fewer than 7 tickets (${barangayByName[name] ?? 0}).`,
      );
    }
  }
  const manualiCount = barangayByName['Manuali'] ?? 0;
  if (manualiCount < 5 || manualiCount > 6) {
    failures.push(`Manuali has ${manualiCount} tickets, expected 5-6.`);
  }

  // ---- Total dataset size within the requested 80-100 ticket range ----
  if (ticketIds.length < 80 || ticketIds.length > 100) {
    failures.push(
      `Total tickets ${ticketIds.length} is outside the target 80-100 range.`,
    );
  }

  // ---- Citizen resolution-feedback: dispute/confirmation ----
  const disputed = await sql<
    {
      id: number;
      status: string;
      disputed_at: string | null;
      resolution_confirmed_at: string | null;
    }[]
  >`
    SELECT id, status, disputed_at, resolution_confirmed_at FROM tickets WHERE disputed_at IS NOT NULL
  `;
  const confirmed = await sql<
    {
      id: number;
      status: string;
      disputed_at: string | null;
      resolution_confirmed_at: string | null;
    }[]
  >`
    SELECT id, status, disputed_at, resolution_confirmed_at FROM tickets WHERE resolution_confirmed_at IS NOT NULL
  `;
  if (disputed.length < 6 || disputed.length > 8) {
    failures.push(`Expected 6-8 disputed tickets, found ${disputed.length}.`);
  }
  if (confirmed.length < 4 || confirmed.length > 6) {
    failures.push(
      `Expected 4-6 resolution-confirmed tickets, found ${confirmed.length}.`,
    );
  }
  for (const row of [...disputed, ...confirmed]) {
    if (row.status !== 'Resolved') {
      failures.push(
        `Ticket #${row.id} has dispute/confirmation state but status is ${row.status}, not Resolved.`,
      );
    }
    if (row.disputed_at && row.resolution_confirmed_at) {
      failures.push(
        `Ticket #${row.id} is both disputed and resolution-confirmed — these must be mutually exclusive.`,
      );
    }
  }

  // ---- Work orders by status ----
  const workOrdersByStatus = await sql<{ status: string; count: number }[]>`
    SELECT status, COUNT(*)::int AS count FROM work_orders GROUP BY status
  `;
  const workOrderStatusMap = Object.fromEntries(
    workOrdersByStatus.map((r) => [r.status, r.count]),
  );

  const resolvedCount = statusMap['Resolved'] ?? 0;

  console.log('\n================ SEED SUMMARY ================');
  console.log('Total tickets:', ticketIds.length);
  const totalReports = (
    await sql<{ count: number }[]>`SELECT COUNT(*)::int AS count FROM reports`
  )[0].count;
  console.log('Total reports:', totalReports);
  console.log(
    'Barangays covered:',
    barangayCoverage.length - uncovered.length,
    '/',
    barangayCoverage.length,
  );
  console.log('By urgency band:', bandMap);
  console.log('By status:', statusMap);
  console.log('By office:', officeMap);
  console.log('Flag counts (from creation-time computation):', flagCounts);
  console.log(
    'Dedup clusters:',
    clusters.map(
      (c) => `#${c.id} ${c.category} member_count=${c.member_count}`,
    ),
  );
  console.log('Resolved count:', resolvedCount);
  console.log(
    'Work orders by status:',
    workOrderStatusMap,
    `(total ${workOrderIds.length})`,
  );
  console.log(
    'Disputed tickets:',
    disputed.length,
    disputed.map((r) => r.id),
  );
  console.log(
    'Resolution-confirmed tickets:',
    confirmed.length,
    confirmed.map((r) => r.id),
  );
  console.log(
    'Hotspot barangay ticket counts:',
    Object.fromEntries(
      HOTSPOTS.map((name) => [name, barangayByName[name] ?? 0]),
    ),
  );
  console.log(
    `\nHIGH tickets: ${highTickets.length} across ${highBarangays.size} barangay(s) — [${[...highBarangays].join(', ')}]`,
  );
  console.table(
    highTickets.map((h) => ({
      id: h.id,
      barangay: h.barangay,
      category: h.category,
      office: h.assigned_office,
      status: h.status,
      elevation_m: h.elevation_m,
      member_count: h.member_count,
      elevationFactor: h.elevation_factor?.toFixed(3),
      precipitationFactor: h.precipitation_factor?.toFixed(3),
      clusterFactor: h.cluster_factor?.toFixed(3),
      priority_score: h.priority_score,
    })),
  );
  console.log('================================================\n');

  if (failures.length > 0) {
    console.error('SEED VALIDATION FAILED:');
    for (const f of failures) console.error(' -', f);
    process.exitCode = 1;
    throw new Error(
      `Seed validation failed with ${failures.length} issue(s). See above.`,
    );
  }
  console.log('All validations passed.');
}

main().catch(async (error) => {
  console.error(error);
  try {
    await sql.end();
  } catch {
    /* already closed */
  }
  process.exit(1);
});
