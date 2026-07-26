# AC-CORE Prototype Realignment Plan
 
Repository: `MMPA-Works/AC-CORE` (commit `9a44a41`)
Target: Municipal Infrastructure Maintenance and Topographical Hazard Mapping System for Angeles City (WD403 Group 9)
 
---
 
## 0. Security Actions (do first)
 
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
 
**Backend** (`accore-backend`, ~1,700 LOC): Express 5, TypeScript, Mongoose, MongoDB Atlas, Cloudinary, Multer, Zod, `express-rate-limit`, `node-cron`, `node-cache`, Turf.
 
**Frontend** (`accore-frontend`, ~5,300 LOC): Angular 21 zoneless, Spartan UI, Tailwind, Leaflet with MarkerCluster, Chart.js via ng2-charts, Google social login.
 
**Working features**: citizen and guest report submission with photo upload and client-side compression, draggable pin plus browser GPS, barangay auto-detect by nearest centroid, Pizza Tracker status timeline, admin login, live clustered map with 10 second refresh, hazard list with filter, sort, pagination, analytics dashboard with 10 minute cache, CSV export, report archiving, citizen verification (upvote), status history audit trail, IP rate limiting, Zod validation.
 
This is a solid CRUD and mapping foundation. The problem is not code quality. The problem is that none of the four modules the paper claims as its research contribution are actually implemented.
 
---
 
## 2. Gap Matrix: Paper vs Repository
 
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
 
Both files are currently sitting unused. This is the highest-value work in the plan.
 
### 4.1 Barangay polygons (GADM 4.1 level 3)
 
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
 
**Remove: Paved Paradox Sorter.** Delete `PRIORITY_COMMERCIAL_ZONES` and the boolean override in `createAndSaveReport` plus the `priorityWeight` stage in the `getReports` aggregation. It has no basis in your literature review, the seven-barangay list has no stated method, and the weighted formula supersedes it. Leaving it in invites the question "what method produced this list?" which has no good answer.
 
**Rework or remove: downstream flow mapping.** `findDownstreamRisks` links each report to the nearest lower-elevation report within 500 m. That is proximity plus altitude, not flow. Water follows terrain gradient, not straight lines between complaint pins. Three options:
 
- Remove it. Cleanest, costs nothing, it is not in the paper.
- Keep the visual layer but rename it to something honest such as "relative elevation context" and explicitly disclaim hydrological accuracy.
- Implement it properly: D8 flow direction and flow accumulation over the SRTM tile, precomputed in the seed script. This is genuinely defensible and maps directly onto the Panfilova et al. (2024) finding about slope and flow accumulation improving prediction reliability.
Option three is a strong differentiator but it is scope creep. Treat it as a stretch goal after the core formula works, and mention it as future work either way.
 
**Keep and formalize: citizen verifications.** The upvote feature is not in the paper but it is useful. Either fold verification count into Cluster Density as a secondary signal, or document it in Scope as a supporting transparency feature. Do not leave it undocumented.
 
---
 
## 12. Bugs Found During the Audit
 
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
 
**Phase 1: Data foundation (week 1)**
Provision Neon with PostGIS. Write the barangay GeoJSON seed script. Write the SRTM sampling script and populate `dem_points`. Compute and record `elev_min`, `elev_max`, and the city bounding box. Verify the 33 polygons and the western extent.
 
**Phase 2: Migration (weeks 2 to 3)**
Stand up the new schema. Swap Mongoose for a Postgres client (Prisma with PostGIS via raw queries, or Drizzle, or plain `pg`). Port each controller. Replace `$near` barangay lookup with `ST_Contains`. Replace the Open-Meteo call with the `dem_points` query. Keep the Angular frontend untouched except for the API response shape.
 
**Phase 3: The research contribution (weeks 4 to 5)**
Build the `tickets` table and the `ST_DWithin` merge transaction with tiered radii. Implement all three urgency factors. Wire the cron recomputation to the weather refresh. Add office routing. This phase is what the paper is actually about, so protect the time.
 
**Phase 4: Integrity layer (week 6)**
EXIF extraction on both client and server, mismatch detection, perceptual hashing, layered and spatial rate limits, persistent limiter store, admin flag review queue.
 
**Phase 5: Presentation and evaluation (week 7)**
Barangay choropleth on the admin map. Urgency-ranked queue as the default admin view. Score breakdown panel showing the three factors per ticket, since a visible breakdown is far more convincing than a single number. Seed demo data. Draft the ISO/IEC 25010 evaluation instrument.
 
---
 
## 14. Paper Edits Required
 
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
 
1. Express to NestJS: refactor, or amend the paper and spend those days on the triage engine?
2. Guest reporting: keep it (and add it to Scope with a justification) or drop it?
3. Downstream flow mapping: delete, rename and disclaim, or implement D8 properly as a stretch goal?
4. Weights w1, w2, w3: hold at 1/3 each until the LGU consultation, or build an admin-configurable weight panel now? A configurable panel is a good answer to "how did you choose the weights" because it makes the provisional nature explicit rather than hiding it.
5. Deduplication radii: confirm the 25 / 50 / 100 m tiers with the CEO during consultation. Their field crews will know whether two potholes 30 m apart are one job or two.
 