# AC-CORE Prototype Realignment Plan
 
Repository: `MMPA-Works/AC-CORE` (commit `9a44a41`)
Target: Municipal Infrastructure Maintenance and Topographical Hazard Mapping System for Angeles City (WD403 Group 9)
 
---
 
## 0. Security Actions (do first)

**Status: 🔲 DEFERRED** — deliberate decision at prototype stage (accepted
risk, not an oversight); will rotate before any real deployment or public
demo. None of the five credentials below were rotated —
`ac-core-nextjs/.env.local` reuses the exact original values (same
`MONGODB_URI`, `CLOUDINARY_URL`, `OPENWEATHERMAP_API_KEY`, and
`JWT_SECRET` originally pasted in chat). Confirmed via grep that no
hardcoded fallback values exist anywhere in the codebase for these
(`process.env.X || "default"` pattern) and `.env.local` was never
committed to either git repo's history. `JWT_SECRET` currently signs live
admin *and* citizen JWT sessions in the Next.js build, so rotation before
any real deployment is not optional — see §16.

| Item | Action |
|---|---|
| MongoDB Atlas password (`ac-admin`) | Rotate. Also restrict Network Access to Render egress IPs instead of `0.0.0.0/0`. |
| Cloudinary API secret | Regenerate in Cloudinary console. |
| Google OAuth client secret | Regenerate in Google Cloud Console. |
| `JWT_SECRET` | Regenerate. This invalidates all existing sessions, which is fine at prototype stage. |
| OpenWeatherMap key | Regenerate. |
 
`.env` is already in `.gitignore`, so nothing is committed. The exposure is from pasting values into chat only.
 
Separate issue in `server.ts`: `app.use(cors())` allows any origin. Restrict to the Vercel domain and `localhost:4200`.
 
---
 
## 1. What the Repository Actually Contains

**Status: ⚠️ SUPERSEDED.** This section describes the pre-migration
Express/Angular repo. The actual build is a from-scratch Next.js app
(`ac-core-nextjs/`), not a port of this code — see §16.

**Backend** (`accore-backend`, ~1,700 LOC): Express 5, TypeScript, Mongoose, MongoDB Atlas, Cloudinary, Multer, Zod, `express-rate-limit`, `node-cron`, `node-cache`, Turf.
 
**Frontend** (`accore-frontend`, ~5,300 LOC): Angular 21 zoneless, Spartan UI, Tailwind, Leaflet with MarkerCluster, Chart.js via ng2-charts, Google social login.
 
**Working features**: citizen and guest report submission with photo upload and client-side compression, draggable pin plus browser GPS, barangay auto-detect by nearest centroid, Pizza Tracker status timeline, admin login, live clustered map with 10 second refresh, hazard list with filter, sort, pagination, analytics dashboard with 10 minute cache, CSV export, report archiving, citizen verification (upvote), status history audit trail, IP rate limiting, Zod validation.
 
This is a solid CRUD and mapping foundation. The problem is not code quality. The problem is that none of the four modules the paper claims as its research contribution are actually implemented.
 
---
 
## 2. Gap Matrix: Paper vs Repository

**Status: ✅ RESOLVED.** Nearly every row below is closed by the Next.js
rebuild. Exception: the NestJS/Express row is moot, not resolved — the app
uses Next.js API routes directly, neither framework. See updated §15 Q1.

| Paper claim | Repository reality | Severity |
|---|---|---|
| PostgreSQL + PostGIS on Neon | MongoDB Atlas | Critical |
| `ST_DWithin` buffer scripts, R-tree spatial indexing | Mongo `$near` on a 2dsphere index | Critical |
| Deduplication engine that **clusters and merges** duplicate pins | Sets a boolean `isPossibleDuplicate` flag. No merge, no ticket entity, no cluster count. | Critical |
| Urgency Score = (w1 x Elevation) + (w2 x Precipitation) + (w3 x Cluster Density) | Not implemented. Replaced by a boolean rule: if barangay is in a hardcoded commercial list AND it is raining, force severity to Critical. | Critical |
| SRTM GL1 30m DEM via OpenTopography | Per-report HTTP call to the Open-Meteo elevation API. The downloaded GeoTIFF is unused. | Critical |
| Normalized real-time rainfall intensity | OpenWeatherMap condition ID collapsed to a single boolean `isRaining`. No mm/h value is read. | Critical |
| GADM 4.1 level 3 barangay polygons | 33 barangay **centroid points**, matched by `$near` within 3 km. The GeoJSON is unused. | High |
| Photo EXIF GPS as primary location source, pin as fallback | No EXIF handling anywhere. Worse, compression runs before any read, which strips EXIF. | High |
| Next.js frontend | Angular 21 | Medium (documentation fix) |
| NestJS backend | Express 5 | Medium |
| Two distinct LGU offices (CEO and ACDRRMO) | One flat `admin` role. `department` is a free-text string that is never used for routing. | Medium |
| Rate limiting and fraud review queue | IP rate limiting exists and is reasonable. No fraud queue, no flags, no image hashing. | Medium |
 
**In the repo but not in the paper** (these will be attacked at defense):
 
- "Paved Paradox Sorter". A hardcoded list of seven commercial barangays that overrides citizen severity. No literature basis, no defined method.
- `findDownstreamRisks` / `getDownstreamGroupings`. Links a report to the nearest lower-elevation report within 500 m and calls it downstream flooding risk. This is not hydrology. Real flow routing needs D8 flow direction and flow accumulation over the DEM, which is what Panfilova et al. (2024) actually did.
- Guest reporting with no account. The paper does not mention it, and it directly weakens every fraud control.
---
 
## 3. Core Decision: Migrate the Database, Amend the Frontend

**Status: ⚠️ IMPLEMENTED DIFFERENTLY.** The team built fresh in Next.js
instead of keeping Angular, superseding this section's "amend the paper,
keep Angular" recommendation below. The Express-vs-NestJS question is also
moot for the same reason — see §16 and updated §15 Q1.

You have three divergences. They do not all deserve the same response.
 
**Migrate: MongoDB to PostgreSQL + PostGIS on Neon.**
Do this. It is not cosmetic. Mongo's `$near` cannot do polygon containment against barangay boundaries, cannot query a DEM point grid efficiently alongside report geometry in one statement, and cannot express the merge-and-recompute-centroid operation transactionally. PostGIS gives you `ST_DWithin`, `ST_Contains`, `ST_Centroid`, and GiST indexes, which are exactly the operations Chapter 1 promises by name. Migrating is roughly one week of work and it converts your largest defense liability into your strongest technical claim.
 
**Amend the paper: Next.js to Angular.**
Do not rewrite 5,300 lines of working Angular. The frontend framework is not a research contribution. Aschieri et al. (2024) is cited for React-Leaflet, but the finding you actually use from them (component-scoped rendering prevents mobile map freezing) applies equally to Angular with Leaflet and MarkerCluster, which is already in the repo. Edit Section 1.6 Scope, the Technical Background, and the Conceptual Framework input list to say Angular 21. Keep the citation, reframe the sentence.
 
**Your call: Express to NestJS.**
NestJS is Express underneath with dependency injection and decorators on top. Refactoring costs three to four days and buys nothing functional. Two options: refactor it, or amend the paper to say Express with a one-line justification (lower runtime overhead, smaller dependency surface for a prototype-scale deployment). I lean toward amending, because that time is better spent on the triage engine. Decide as a group, since your adviser may have an opinion.
 
Net effect on the document: one database migration in code, three paragraphs of edits in Chapters 1 and 2.
 
---
 
## 4. Data Pipeline: Using the GeoJSON and the GeoTIFF

**Status: ✅ IMPLEMENTED.** Both seed scripts done and verified: 33
barangay polygons confirmed via the `NAME_3` property, the western
Sapangbato extent bug confirmed real (120.4808°E, below the old hardcoded
120.5°E floor), `elev_min`/`elev_max` computed barangay-constrained via
`ST_Contains` and stored as fixed `config` table values (not recomputed
live).

Both files are currently sitting unused. This is the highest-value work in the plan.
 
### 4.1 Barangay polygons (GADM 4.1 level 3)

**Update — OSM cross-validation.** GADM's 33 polygons were checked against
OpenStreetMap as an independent source. Overpass has no barangay-level
(`admin_level=10`) boundaries for Angeles City at all (confirmed: querying
that level within the city bbox returns 15 real, geometrically-complete
relations, but every one belongs to a *neighboring* municipality — Mexico,
San Fernando, Bacolor, Magalang — not Angeles; two names look like
near-matches, "Pulung Bulu" vs. GADM's "Pulungbulu" and "San Jose" vs.
GADM's "SanJose," but the tags confirm these are different towns'
barangays, not the same place). So GADM's barangay subdivision has no OSM
barangay-level replacement or supplement to compare against.

What OSM *did* surface: a real ~283m edge gap at the Sto. Domingo/Cutcut
boundary. The original trigger was a citizen-reported address (Mansfield
Residences) whose exact coordinates were never independently obtained;
the test instead used Sto. Domingo's approximate OSM/Overpass centroid as
a same-neighborhood proxy — a sanity check, not proof of Mansfield
Residences' specific location. That proxy point fell outside every one of
GADM's 33 polygons and was being wrongly rejected as "outside the city."
Fixed by
importing OSM's city-level outer boundary (relation 9386775, admin_level=6,
"City of Angeles") into a new `city_boundary_osm` table, and changing
`findBarangayForPoint()` (`lib/geo/barangay.ts`) to a two-stage check:
exact `ST_Contains` against a GADM barangay first (unchanged fast path);
if that fails, check `ST_Contains` against the OSM outer boundary — if
inside, snap to whichever GADM barangay is nearest via `ST_Distance`/`<->`
rather than rejecting; if outside even that, reject as genuinely outside
the city. OSM is used *only* for this outer accept/reject decision —
barangay identity always comes from GADM.

**Deliberate exception: Calibutbut.** OSM's Angeles City relation carries
an unresolved tag on itself — `fixme: confirm boundaries, currently
includes Barangay Calibutbut of Bacolor` — meaning OSM's own outer boundary
may be wrong at that one spot. This is a non-issue for us: Calibutbut was
never one of GADM's 33 Angeles barangays to begin with, so there is no
code path where that OSM data-quality caveat could affect barangay
assignment. GADM is trusted for Calibutbut without exception, by
construction, not by a special case that had to be written.

**New flag: `BOUNDARY_FALLBACK`.** Whenever a report resolves via the
nearest-barangay fallback rather than a strict polygon match, the report
row's `flags` array gets `BOUNDARY_FALLBACK:<barangayName>:<distanceM>`
(e.g. `BOUNDARY_FALLBACK:Cutcut:283`) — same mechanism as
`LOCATION_MISMATCH`/`DUPLICATE_IMAGE`/`STALE_PHOTO`/`NO_EXIF` (PLAN.md §8),
surfaced in `/admin/flagged` with the barangay and distance shown as
evidence. Not an auto-reject, same philosophy as the fraud flags: route to
admin review, don't silently guess and don't silently block.

**Final outcome — GADM replaced with PSGC/OCHA as the barangay source.**
The `BOUNDARY_FALLBACK` mechanism above was built to patch a ~283m edge
gap, but testing against real, independently-verified addresses (not OSM
centroid proxies) found something more serious: GADM's own raw source
data for Angeles City's 33 barangays — confirmed by filtering the
unfiltered nationwide `gadm41_PHL_3.json`, not just the pre-filtered
`angeles.geojson` — averages **7.6 vertices per polygon** (near-rectangles;
Sto. Domingo itself has only 5). A real address (Mansfield Residences,
Brgy. Sto. Domingo, coordinates obtained via Google Maps "What's here")
fell **862m–1.8km** from every one of the 33 GADM polygons, including the
one it's actually in — not an edge-precision issue, a genuine
mis-registration.

GADM was replaced with `PH_Adm4_BgySubMuns` from the
`altcoder/philippines-psgc-shapefiles` GitHub repo (OCHA-derived, refined
against PSA's official PSGC, updated through Dec 2023) — **130.5 avg
vertices/barangay**, Sto. Domingo alone at 293. Verified against four real,
independently-sourced landmarks across four different barangays (Mansfield
Residences/Sto. Domingo, Fields Bistro on Walking St./Balibago, Jose P.
Dizon Elementary School/Pandan, the Barangay Hall itself/Malabañas) — all
four resolved correctly via strict `ST_Contains`, no fallback needed — and
three deliberately-outside-city points, all correctly rejected.

Migration handled as a real data change, not a silent swap: old table kept
as `barangays_gadm_old` (not dropped), new data staged and verified in
`barangays_v2` before promotion, every existing ticket's `barangay_id`
recomputed from its actual stored geometry against the new polygons (not
copied by matching old IDs), inside one transaction with the FK constraint
dropped and rebuilt against the correct table. Caught one thing along the
way: three demo tickets, seeded from `ST_PointOnSurface` samples of the
*old* GADM shapes, turned out to sit up to 1.28km outside the real city
entirely once checked against `city_boundary_osm` — deleted rather than
force-assigned, since keeping them (even via fallback) would mean the demo
dataset violated the same city-boundary validation real submissions are
held to.

`city_boundary_osm` + the nearest-snap fallback remains in place as a
safety net for genuine remaining edge cases — with PSGC's real detail, it
should be a rare correction, not the routine one GADM's crude shapes
required.

Build a one-time seed script:
 
1. Load the 33-feature GeoJSON.
2. Insert into a `barangays` table with `geom geometry(MultiPolygon, 4326)` and a GiST index.
3. Compute the true city bounding box with `ST_Extent` and store it in config.
This replaces three weak pieces of the current code at once:
 
- `getNearestBarangay` becomes `ST_Contains(b.geom, ST_SetSRID(ST_MakePoint($lng,$lat),4326))`. Exact assignment instead of nearest centroid within 3 km. A pin 2.9 km outside the city currently gets accepted and assigned to a barangay. That is a demo-breaking bug.
- The hardcoded validation bounds in `hazard-report.validation.ts` (lat 15.1 to 15.25, lng 120.5 to 120.65) get replaced by real containment. Verify this specifically: Sapangbato extends west toward the Pinatubo foothills and may fall outside the current longitude floor of 120.5. Run `ST_Extent` and check before trusting the existing numbers.
- The admin map gains a real barangay choropleth layer served as GeoJSON, which is what "barangay hotspot analytics" in the objectives actually means.
### 4.2 SRTM DEM (GeoTIFF, 30m)
 
Neon's support for the `postgis_raster` extension is unconfirmed. Do not block on it. Use the point-table approach, which is more defensible anyway because it is inspectable.
 
One-time preprocessing script (Node with `geotiff` package, or Python with `rasterio` if easier):
 
1. Clip the GeoTIFF to the barangay `ST_Extent` bounding box.
2. Sample every cell into rows of `(lon, lat, elevation_m)`.
3. Bulk insert into `dem_points` with `geom geometry(Point,4326)` and a GiST index.
4. Compute and store city-wide `elev_min` and `elev_max` in a config table. You need these for normalization and you should quote the real numbers at defense, not estimates.
Angeles City is roughly 60 km². At 30 m resolution that is on the order of 65,000 to 70,000 rows. Trivial for Postgres, and it fits in Neon's free tier.
 
Lookup at report time:
 
```sql
SELECT elevation_m
FROM dem_points
ORDER BY geom <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)
LIMIT 1;
```
 
This removes the external Open-Meteo dependency entirely, which matters because the current implementation silently returns `0` on any API failure. A failed elevation fetch currently produces a report at sea level, which under an inverse-normalized elevation factor would score as maximum urgency. That is a live correctness bug waiting to happen.
 
**Security note**: `createAndSaveReport` currently accepts `elevation` from `req.body`. A client can post any value. Elevation must be computed server-side only, and the field must be stripped from the request schema.
 
---
 
## 5. Target Schema (PostgreSQL + PostGIS)

**Status: ⚠️ IMPLEMENTED DIFFERENTLY.** `citizens` table added (not in the
original schema below — accounts became required, see §9/§15 Q2);
`office_reassignments` as its own table, not layered into `status_history`
(that column is a typed `ticket_status` enum and can't hold an
office-change event without corrupting it); distinct JWT session
types/cookies for admin vs citizen; `rate_limit_events` table added
(Postgres-backed rate limiter store, not in the original schema).

**Pizza Tracker (citizen status timeline) — ✅ IMPLEMENTED.** Named in §1's
old-repo feature list but never its own numbered section here. Rebuilt at
`/dashboard/reports/[id]`: reads `status_history`, synthesizes a
"Reported" first step from the ticket's own `created_at` (ticket creation
never logs a `status_history` row — only admin-driven advances do), and is
ownership-scoped so a citizen can't view another citizen's report by
guessing an ID (wrong-owner and nonexistent both return the same 404).

The single most important structural change is splitting reports from tickets. The paper says reports are *merged*. You cannot merge without a container entity.
 
```
barangays      id, name, geom(MultiPolygon,4326)                       [GiST]
dem_points     id, elevation_m, geom(Point,4326)                       [GiST]
 
tickets        id, category, barangay_id, status, geom(Point,4326),     [GiST]
               member_count, elevation_m, elevation_factor,
               precipitation_factor, cluster_factor,
               urgency_score, urgency_band, created_at, updated_at,
               assigned_office
 
reports        id, ticket_id, citizen_id, title, description,
               citizen_severity, geom(Point,4326), pin_geom, exif_geom,
               exif_captured_at, image_url, image_phash,
               location_mismatch_m, flags[], created_at
 
status_history ticket_id, status, admin_id, admin_name, changed_at
verifications  ticket_id, citizen_id, created_at
admins         id, first_name, last_name, email, password_hash,
               office ENUM('CEO','ACDRRMO'), role ENUM('officer','supervisor')
```
 
Notes on specific columns:
 
- `citizen_severity` and `urgency_score` are deliberately separate. One is a subjective input, one is a computed output. Keeping them distinct is a strong defense point, because it shows the triage engine is doing independent work rather than restating what the citizen typed. Label them differently in the admin UI ("Reported as: Critical" vs "System urgency: 0.71 High").
- `pin_geom` and `exif_geom` are stored separately so the cross-check is auditable after the fact.
- `member_count` is the Cluster Density input. It must be maintained on every merge.
---
 
## 6. Deduplication Engine

**Status: ✅ IMPLEMENTED.** Tiered-radius merge transaction built exactly
as specified below. Beyond spec: a `pg_advisory_xact_lock` concurrency fix
was added — a plain `SELECT ... FOR UPDATE` was tried first per the
literal query below, but combined with the `<->` KNN ordering used for
nearest-ticket lookup it hit a Postgres planner limitation ("attempted to
lock invisible tuple"). Replaced with an advisory lock keyed on
`(category, barangay_id)` instead.

Replace the boolean flag with an actual merge, executed inside a transaction on report submission.
 
```sql
SELECT t.id,
       ST_Distance(t.geom::geography, $point::geography) AS dist
FROM tickets t
WHERE t.category = $category
  AND t.status IN ('Reported','Under Review','In Progress')
  AND t.created_at > now() - interval '7 days'
  AND ST_DWithin(t.geom::geography, $point::geography, $radius)
ORDER BY dist
LIMIT 1;
```
 
If a row is returned: attach the report to that ticket, increment `member_count`, recompute the ticket geometry as `ST_Centroid` of its member reports, re-run the urgency score. If no row: create a new ticket with `member_count = 1`.
 
**Category-specific radius.** The current flat 50 m is arbitrary. Defend a tiered value instead:
 
| Category | Radius | Justification |
|---|---|---|
| Pothole, Streetlight Out, Uneven Sidewalk | 25 m | Point defects. Consumer smartphone GPS is accurate to roughly 5 to 10 m under open sky and degrades in built-up areas, so 25 m absorbs device error without merging genuinely separate potholes. |
| Clogged Drain, Leaking Pipe | 50 m | Drainage segments span a block face. |
| Flooding | 100 m | Areal, not point. One flood event legitimately generates pins across a wide footprint. |
 
Put this table in the paper. "Why 50 metres?" is the single most likely technical question at defense and a tiered, justified answer is much stronger than a magic number.
 
**Time window**: 7 days for active tickets. A pothole reported today and again next month are the same defect, but a resolved-then-recurring flood is a new event. Tie the window to ticket status, not just age.
 
---
 
## 7. Topographical Triage Engine

**Status: ✅ IMPLEMENTED.** Formula implemented exactly as written below —
weights 1/3 each, all three factors, bands. Recomputation deviates from
spec: the `node-cron` job described below was replaced by on-demand
recompute triggered whenever an admin loads the ticket list or map,
because Vercel Hobby plan only allows once-daily cron scheduling, which
would gut the "live re-ranking" demo value this section itself calls out
below. The cron route (`app/api/cron/recompute/route.ts`) is kept as a
manual, secret-gated fallback trigger.

Implement the formula from the paper exactly as written. Do not improvise, and delete the Paved Paradox rule that currently stands in for it.
 
```
Urgency Score = (w1 x ElevationFactor) + (w2 x PrecipitationFactor) + (w3 x ClusterDensity)
w1 = w2 = w3 = 1/3   (provisional, pending CEO and ACDRRMO consultation)
```
 
All three factors normalize to 0.0 to 1.0, so the score is bounded 0 to 1.
 
**Elevation Factor** (inverse-normalized, lower ground scores higher):
 
```
E = (elev_max - elev_report) / (elev_max - elev_min)
```
 
`elev_max` and `elev_min` come from the DEM seed step in Section 4.2. Use real computed values.
 
Optional refinement, worth mentioning at defense as future work but not required for the prototype: replace the city-wide normalization with a local depression measure, `elev_report - AVG(elevation within 200 m)`. Water pools in local depressions, not merely at low absolute altitude. City-wide normalization is what the paper specifies, so ship that first and cite the refinement as a limitation.
 
**Precipitation Factor**: read the actual millimetre value, not the condition ID. OpenWeatherMap current-weather returns `rain["1h"]` in mm when precipitation is present, and omits the key when it is not (treat missing as 0). Normalize against a documented threshold:
 
```
P = min(rain_1h / 30, 1.0)
```
 
The 30 mm/h cap is defensible because it is the PAGASA rainfall intensity ceiling: light is under 2.5, moderate 2.5 to 7.5, heavy 7.5 to 15, intense 15 to 30, torrential above 30 mm/h. Cite PAGASA in the paper. This turns an arbitrary constant into a nationally standardized one, which is exactly the kind of grounding a panel rewards.
 
**Cluster Density**: log-scaled so the tenth duplicate report does not count as much as the second.
 
```
C = min( ln(1 + member_count) / ln(1 + 10), 1.0 )
```
 
Cap at 10 members. State the cap and the reason (diminishing informational value per additional duplicate) in the paper.
 
**Bands**: score under 0.40 is Low, 0.40 to 0.70 is Medium, above 0.70 is Critical. Tune after seeding test data.
 
**Recomputation**: precipitation changes independently of any user action. Extend the existing `node-cron` job (already running every 10 minutes for weather) to recompute `precipitation_factor` and `urgency_score` for all active tickets after each weather refresh. Live re-ranking of the queue as a storm moves in is the single most demo-friendly feature in this entire plan. Lead with it at defense.
 
---
 
## 8. EXIF Metadata and Fraud Controls

**Status: ✅ IMPLEMENTED.** Client reads EXIF before compression, server
re-verifies from the uploaded buffer, all four flags (`LOCATION_MISMATCH`,
`STALE_PHOTO`, `NO_EXIF`, `DUPLICATE_IMAGE`) implemented as specified,
dHash perceptual hashing via `sharp`, flags route to `/admin/flagged`
rather than blocking submission.

**Order of operations is the critical detail here.** The current `onFileSelected` compresses immediately, and `browser-image-compression` strips EXIF by default. Any EXIF work must happen before or around compression.
 
Client (`report.ts`):
 
1. Read EXIF from the **original** `File` with `exifr` before touching compression. Extract `GPSLatitude`, `GPSLongitude`, `DateTimeOriginal`.
2. If GPS is present, fly the map to those coordinates and set the pin there. This makes EXIF the primary location source, as the paper specifies, with manual pin placement as the visible fallback.
3. Compress with `preserveExif: true` so the server can independently verify.
4. Submit `pin_lat`, `pin_lng`, and the image. Do not submit client-extracted EXIF as trusted data.
Server:
 
1. Re-extract EXIF from the uploaded buffer with `exif-reader` or `exifr`. Client-supplied EXIF is spoofable and must never be trusted. Store as `exif_geom` and `exif_captured_at`.
2. Compute `location_mismatch_m = ST_Distance(pin_geom, exif_geom)`. Flag `LOCATION_MISMATCH` above 100 m.
3. Flag `STALE_PHOTO` if `DateTimeOriginal` is more than 24 hours old, and `NO_EXIF` if the image has none (screenshots and downloaded images have no GPS, which is itself a signal).
4. Compute a perceptual hash (dHash via `sharp`) and store it. Flag `DUPLICATE_IMAGE` on a near match against any report in the last 30 days. This catches the same photo resubmitted from different accounts, which IP rate limiting cannot catch.
Flags do not reject the report. They route it to an admin review queue. That distinction matters: automatic rejection on a weak signal creates false negatives against legitimate reporters, and the paper positions the system as a decision support tool, not an automated gatekeeper.
 
---
 
## 9. Rate Limiting Hardening

**Status: ⚠️ IMPLEMENTED DIFFERENTLY.** The guest reporting question below
is RESOLVED, not open: citizen accounts are required, there is no
guest/anonymous mode at all — stronger than either option this section
originally offered. Rate limiting is account-keyed (`citizen_id`) as the
primary control, matching this section's original per-account intent; the
IP-based limit is a secondary backstop only, not primary. Store is
Postgres-backed (new `rate_limit_events` table), not Upstash Redis —
reuses the existing DB connection, no new service needed at this volume.

The existing limits (5 reports per hour per IP, 5 login attempts per 15 minutes) are sensible but have two failure modes in the Philippine context.
 
**Problem 1: carrier-grade NAT.** Globe and Smart mobile subscribers share public IPs at large scale. A 5 per hour IP limit can lock out an entire barangay during a flood, which is precisely when you need reports most. Fix with layered limits:
 
| Layer | Limit |
|---|---|
| Per IP | 20 per hour (loose, catches only crude abuse) |
| Per authenticated account | 5 per hour |
| Per account, spatial | Max 3 reports within a 25 m radius per 24 hours |
| Guest submissions | 2 per hour per IP, plus Cloudflare Turnstile |
 
The spatial limit is the interesting one and it is nearly free to implement once `ST_DWithin` is in place.
 
**Problem 2: in-memory state.** `express-rate-limit` defaults to memory. Render's free tier sleeps and restarts containers, which resets every counter. Move the store to Postgres (`rate-limit-postgresql`) or Upstash Redis free tier.
 
**On guest reporting**: it is in the repo but not in the paper, and it undermines every control above. Recommend one of two paths. Either drop it and require an account (cleanest, matches the paper as written), or keep it behind Turnstile with strict limits and add a Scope paragraph justifying it as emergency access. Decide before the LGU consultation, since ACDRRMO will likely have an opinion about anonymous reports.
 
---
 
## 10. LGU Office Separation

**Status: ✅ IMPLEMENTED.** Office enum + auto-routing by category built
as specified. Office-scoped default queue view with an explicit "view
full city" toggle, and a manual reassign action with its own audit table
(`office_reassignments`) — both flagged as not-yet-built in an earlier
pass of this build, now done.

The paper names two offices with distinct workflows. The repo has one flat admin role and an unused `department` string.
 
Add `office` as an enum on `admins`, and auto-route tickets by category:
 
| Category | Office |
|---|---|
| Flooding, Clogged Drain, Fallen Tree | ACDRRMO |
| Pothole, Uneven Sidewalk, Streetlight Out, Leaking Pipe | CEO |
| Uncollected Garbage, Illegal Dumping, Overgrown Vegetation, Other | CEO, with manual reassignment |
 
Each office sees its own queue by default, with a toggle for the full city view. Add a manual reassign action, because the boundary is not always clean (a clogged drain causing street flooding belongs to both).
 
This is a small change with outsized value: it is direct, visible evidence that you addressed Specific Objective 1 (analyze the operational requirements and workflows of the CEO and ACDRRMO) rather than treating the two offices as one generic admin.
 
---
 
## 11. Features to Remove or Rework

**Status: ⚠️ IMPLEMENTED DIFFERENTLY.** Confirmed by direct grep across
the Next.js build: Paved Paradox Sorter and the downstream flow mapping
code below never existed in this build (fresh app, not a port of the
Express code) — nothing to remove, both items moot rather than resolved.
Citizen verifications: confirmed against Chapter 1 Scope — not named as a
covered feature in the paper. The `verifications` table exists in schema
(kept for a possible future Cluster Density signal per this section's own
"keep and formalize" note below) but the upvote feature itself is
deliberately not built, not an open gap.

**Remove: Paved Paradox Sorter.** Delete `PRIORITY_COMMERCIAL_ZONES` and the boolean override in `createAndSaveReport` plus the `priorityWeight` stage in the `getReports` aggregation. It has no basis in your literature review, the seven-barangay list has no stated method, and the weighted formula supersedes it. Leaving it in invites the question "what method produced this list?" which has no good answer.
 
**Rework or remove: downstream flow mapping.** `findDownstreamRisks` links each report to the nearest lower-elevation report within 500 m. That is proximity plus altitude, not flow. Water follows terrain gradient, not straight lines between complaint pins. Three options:
 
- Remove it. Cleanest, costs nothing, it is not in the paper.
- Keep the visual layer but rename it to something honest such as "relative elevation context" and explicitly disclaim hydrological accuracy.
- Implement it properly: D8 flow direction and flow accumulation over the SRTM tile, precomputed in the seed script. This is genuinely defensible and maps directly onto the Panfilova et al. (2024) finding about slope and flow accumulation improving prediction reliability.
Option three is a strong differentiator but it is scope creep. Treat it as a stretch goal after the core formula works, and mention it as future work either way.
 
**Keep and formalize: citizen verifications.** The upvote feature is not in the paper but it is useful. Either fold verification count into Cluster Density as a secondary signal, or document it in Scope as a supporting transparency feature. Do not leave it undocumented.
 
---
 
## 12. Bugs Found During the Audit

**Status: ⚠️ MOSTLY MOOT.** Listed bugs are Express/Mongo-specific and
don't exist in this from-scratch build; the underlying issues they point
at are independently fixed by the new architecture (elevation always
server-computed via DEM lookup — never trusts client input, EXIF read
before compression, exact `ST_Contains` instead of hardcoded
bounds/nearest-centroid). One exception carries forward unresolved: "no
automated tests" is still true in the Next.js build too — confirmed zero
`.test.ts`/`.spec.ts` files anywhere in the codebase.

| Location | Issue |
|---|---|
| `hazard-report.controller.ts` | `ACTIVE_PUBLIC_STATUSES` includes `"Dispatched"`, which is not in the model's status enum. Public report queries silently miss nothing today only because the value can never be set. |
| `hazard-report.controller.ts` | `elevation` is read from `req.body`. Client-controlled and unvalidated. |
| `fetchElevationFromAPI` | Returns `0` on any failure. Under inverse-normalized scoring, 0 m becomes maximum urgency. Fail loudly instead. |
| `report.ts` (frontend) | Compression runs before any EXIF read, destroying the metadata. |
| `hazard-report.validation.ts` | Hardcoded coordinate bounds. Verify against the real `ST_Extent`, particularly the western edge at Sapangbato. |
| `barangay.controller.ts` | Nearest centroid within 3 km accepts points well outside the city. |
| `server.ts` | `cors()` with no origin restriction. |
| Analytics | 10 minute cache TTL on a dashboard described as real-time. Either shorten the TTL or stop calling it real-time in the paper. |
| Frontend `.spec.ts` files | Scaffolds only, no assertions. ISO/IEC 25010 evaluation will want evidence of testing. |
 
---
 
## 13. Phased Roadmap

**Overall status**: Phases 1–4 ✅ COMPLETE. Phase 5 nearly complete — only
the ISO/IEC 25010 instrument (a paper deliverable, not code) remains; see
below. Build order did not strictly follow this list: the admin
dashboard (Phase 5 scope — urgency-ranked queue, score breakdown panel)
was actually built *before* Phase 4's EXIF/rate-limiting work, because it
was needed to test and demo the Phase 3 engine first. Citizen accounts
were not scoped to any phase originally and landed after Phase 4.

**Phase 1: Data foundation (week 1)** — ✅ COMPLETE.
Provision Neon with PostGIS. Write the barangay GeoJSON seed script. Write the SRTM sampling script and populate `dem_points`. Compute and record `elev_min`, `elev_max`, and the city bounding box. Verify the 33 polygons and the western extent.
 
**Phase 2: Migration (weeks 2 to 3)** — ✅ COMPLETE. Note: "migration"
undersells what happened — this was a from-scratch Next.js build, not a
port of the Express/Mongoose code. See §16.
Stand up the new schema. Swap Mongoose for a Postgres client (Prisma with PostGIS via raw queries, or Drizzle, or plain `pg`). Port each controller. Replace `$near` barangay lookup with `ST_Contains`. Replace the Open-Meteo call with the `dem_points` query. Keep the Angular frontend untouched except for the API response shape.
 
**Phase 3: The research contribution (weeks 4 to 5)** — ✅ COMPLETE. Cron
recomputation deviates from spec — see updated §7.
Build the `tickets` table and the `ST_DWithin` merge transaction with tiered radii. Implement all three urgency factors. Wire the cron recomputation to the weather refresh. Add office routing. This phase is what the paper is actually about, so protect the time.
 
**Phase 4: Integrity layer (week 6)** — ✅ COMPLETE, expanded beyond
original scope to include citizen accounts (signup/login required, no
guest mode), which is what let rate limiting become account-keyed as §9
originally intended.
EXIF extraction on both client and server, mismatch detection, perceptual hashing, layered and spatial rate limits, persistent limiter store, admin flag review queue.
 
**Phase 5: Presentation and evaluation (week 7)** — NEARLY COMPLETE, only
the non-code deliverable remains:
- ✅ Urgency-ranked queue as the default admin view — done (`/admin/tickets`, sorted `urgency_score DESC`)
- ✅ Score breakdown panel showing the three factors per ticket — done (`/admin/tickets/[id]`), and hardened to show the explicit 1/3 weight and per-factor contribution alongside each value, not just the final score, so it reads clearly at a glance for defense
- ✅ Barangay choropleth on the admin map — done (`/admin/map`, `GET /api/admin/barangays/geo`); subtle fill/outline layer under the ticket pins so it doesn't compete visually with urgency color-coding
- ✅ Seed demo data — done (`scripts/seed-demo.ts`, `npm run seed:demo`); idempotent (clears its own previously-seeded rows via a `@ac-core-demo.local` email marker before reseeding), 10 tickets across 8 barangays and 7 categories, spread across all three urgency bands (2 Low / 5 Medium / 3 Critical), 7 merged tickets with member_count 2–10, one report carrying a `LOCATION_MISMATCH` flag on a Critical ticket. Also seeds the same `config` table cache the live weather recompute reads from, so demo urgency scores survive the recompute that fires on every admin dashboard/map load instead of being silently overwritten by whatever the real weather is doing outside — this was found and fixed during Phase 5 testing, not anticipated in the original script design.
- 🔲 Draft the ISO/IEC 25010 evaluation instrument — NOT built; documentation/survey deliverable outside this codebase, explicitly not attempted as code, still open
 
---
 
## 14. Paper Edits Required

**Status: 🔲 NOT DONE.** This is a writing task on the actual thesis
document, outside this codebase — not something implementation work
addresses. Flag explicitly: the first bullet below (change Next.js to
Angular) is now backwards relative to what was actually built — the real
app IS Next.js (see §3, §16), so the paper should keep Next.js language
and drop the Angular-amendment plan entirely. This section needs a fresh
look, not execution of the bullet list as originally written.

Assuming you adopt the recommendations above:
 
- **Section 1.3 Conceptual Framework, Input**: change the stack listing from Next.js to Angular. Resolve Express versus NestJS.
- **Section 1.6 Scope, Technologies to be Used**: same change. Also remove GeoServer, which was already dropped in favour of managed hosting but still appears in some drafts.
- **Section 1.6 Scope, Covered System Features**: add the tiered deduplication radius table. Add EXIF as the primary location source with pin placement as fallback. Decide the guest reporting question and state it.
- **Section 1.6 Delimitations**: add a line stating that elevation data is pre-sampled from the SRTM GeoTIFF into an indexed point table rather than queried as a live raster, and that horizontal resolution is therefore bounded at approximately 30 m.
- **Section 2.1 Technical Background**: reframe the Aschieri et al. (2024) discussion so the finding about component-scoped map rendering is applied to Angular with Leaflet rather than React-Leaflet specifically. Keep the citation.
- **Chapter 1 and 2 generally**: add the PAGASA rainfall intensity thresholds as the justification for the precipitation normalization cap, with a proper reference entry.
All in-text citations follow the APA 7 rules already in force for this document: three or more authors take et al. from the first citation, two authors use an ampersand inside parentheses and "and" in prose, grouped sources are alphabetized and semicolon-separated, and the sentence period falls outside the closing parenthesis.
 
---
 
## 15. Open Questions for the Group

**Status: ⚠️ 2 of 5 resolved.** Q1 and Q2 below no longer apply as
originally framed — see notes. Q3–Q5 are still genuinely open.

1. ~~Express to NestJS: refactor, or amend the paper and spend those days on the triage engine?~~ — **MOOT, not just answered.** The app is Next.js API routes directly, neither Express nor NestJS. Remove this framework choice from the paper entirely rather than picking a side.
2. ~~Guest reporting: keep it (and add it to Scope with a justification) or drop it?~~ — **RESOLVED.** Citizen accounts are required; there is no guest/anonymous reporting mode at all. Stronger than either option originally listed here (Turnstile-gated keep, or drop) — it was dropped entirely.
3. Downstream flow mapping: delete, rename and disclaim, or implement D8 properly as a stretch goal? — still open, unchanged.
4. Weights w1, w2, w3: hold at 1/3 each until the LGU consultation, or build an admin-configurable weight panel now? A configurable panel is a good answer to "how did you choose the weights" because it makes the provisional nature explicit rather than hiding it. — still open, unchanged (weights are hardcoded 1/3 each in `lib/triage/urgency.ts`).
5. Deduplication radii: confirm the 25 / 50 / 100 m tiers with the CEO during consultation. Their field crews will know whether two potholes 30 m apart are one job or two. — still open, unchanged.

---

## 16. Build Log / Deviations from Plan

Every point where the actual Next.js implementation diverged from what
this document originally specified, with the reason. Written after the
fact from the real build, not planned in advance like the sections above.

1. **Citizen accounts required, guest mode fully removed.** Not just
   deprioritized — there is no anonymous/guest submission path at all.
   Resolves §9 and §15 Q2.
2. **Next.js chosen over Angular.** Supersedes §3's "amend the paper, keep
   Angular" recommendation — the team built a fresh Next.js app instead of
   keeping the existing Angular frontend.
3. **Backend framework question is moot, not decided.** The app uses
   Next.js API routes directly — neither Express nor NestJS exists in this
   build. Resolves §15 Q1 by making it inapplicable rather than answered.
4. **On-demand recompute replaces the cron job.** Vercel Hobby plan only
   allows once-daily cron scheduling, which would gut the "live
   re-ranking as a storm moves in" demo value §7 calls out. Urgency now
   recomputes inline whenever an admin loads the ticket list or map; the
   cron route (`app/api/cron/recompute/route.ts`) is kept as a manual,
   secret-gated fallback trigger in case the team upgrades to Pro later.
5. **Drizzle + raw SQL split, by column type not by table.** Drizzle's
   PostGIS support is weak, so non-geometry columns are Drizzle-managed
   while geometry columns (`barangays.geom`, `dem_points.geom`,
   `tickets.geom`, `reports.geom`/`pin_geom`/`exif_geom`) and any query
   touching them go through raw SQL via `postgres.js` tagged templates
   instead (`lib/db/raw.ts`).
6. **`pg_advisory_xact_lock` concurrency fix in the dedup merge.** §6's
   literal query was tried with a plain `SELECT ... FOR UPDATE` first, but
   combined with the `<->` KNN ordering used for nearest-ticket lookup it
   hit a Postgres planner limitation ("attempted to lock invisible
   tuple"). Replaced with an advisory lock keyed on
   `(category, barangay_id)` — coarser than the actual dedup radius, but
   adequate at citizen-reporting volumes.
7. **`office_reassignments` as its own table.** Not layered into
   `status_history` as one might assume from §5's schema — that table's
   `status` column is a typed `ticket_status` enum, and an office
   reassignment isn't a status value.
8. **Rate limiting store is Postgres-backed, not Upstash Redis.** §9
   suggested either; the Postgres option was taken because it reuses the
   existing DB connection with no new service or account needed at this
   app's volume.
9. **§0's secrets were never rotated.** `.env.local` reuses the exact
   `MONGODB_URI`, `CLOUDINARY_URL`, `OPENWEATHERMAP_API_KEY`, and
   `JWT_SECRET` values originally pasted in chat. `JWT_SECRET` now signs
   live admin and citizen sessions, so this is a live-app exposure now,
   not just a legacy one from the old Mongo/Express repo.
10. **Pizza Tracker rebuilt from scratch.** Not originally its own
    numbered section — only named in §1's old-repo feature list. Now at
    `/dashboard/reports/[id]`, documented under §5.
11. **Score breakdown panel landed early.** §13 Phase 5 scope, but it was
    already built as a side effect of earlier admin dashboard work
    (`/admin/tickets/[id]`'s "System Urgency (computed)" section), not as
    a late-phase task.
 