# Database Reference

> **Update this document whenever a migration adds, removes, renames, or significantly changes a table, view, enum, or important column.** A schema change without a matching update here is an incomplete change.

This is a plain-English reference for every table/view PORAC-SDSS's Postgres database holds — what it's for, who touches it, and whether an empty table means something is broken or is just normal. It exists because a database audit found several real, correctly-designed tables that were easy to mistake for dead schema just by glancing at row counts in a fresh development database.

Two ORMs are in play (see `CLAUDE.md`'s Architecture section for the full rationale): Drizzle (`api/src/db/schema.ts`) manages every non-geometry column; anything touching a `geometry` column goes through the raw `PG` postgres.js client instead, so several tables below exist in Postgres but are intentionally **not** in `schema.ts`.

---

## A. Core application tables

### `citizens`
- **Purpose:** One row per citizen account. Email/password login, or OAuth-only (nullable `password_hash`).
- **Reads:** Auth (`AuthService.citizenLogin`), report submission (attaches `citizen_id`), Account & Security page, admin views that show reporter identity.
- **Writes:** Signup (`AuthService.citizenSignup`), OAuth first-login, password change/reset (`password_changed_at`, `session_valid_after`).
- **Expected empty?** No in any environment with real usage; empty only immediately after a fresh migration with no seed run.
- **Ownership:** Application (Drizzle).
- **Never manually delete:** Not a system table, but deleting rows here breaks every FK'd `reports`/`password_reset_tokens`/`citizen_identities`/`citizen_audit_events` row — treat deletions as a real data-loss operation, not routine cleanup.

### `admins`
- **Purpose:** One row per admin/staff account (`officer`/`supervisor`/`system_admin` role, `MEO`/`MDRRMO`/`null` office). Carries its own session-security columns, parallel to `citizens`': `password_changed_at`, `session_valid_after` (bumped on password change/reset, checked by `SessionService.verifyAdminSession` to invalidate stale JWTs server-side), and `is_active` (admin deactivation — see §E).
- **Reads:** Admin login/session verification, Admin Management page, every RBAC/office-scope check (`api/src/common/authz/admin-scope.ts`).
- **Writes:** `seed:admin`/`seed:e2e-admins` scripts, Admin Management create/update/deactivate/reactivate, password reset.
- **Expected empty?** No — at least one `system_admin` must exist for the app to be operable; the last-active-system-admin lockout (`AdminsService`) exists specifically to prevent this table reaching a state with zero active system admins.
- **Ownership:** Application (Drizzle).

### `reports`
- **Purpose:** One row per citizen submission (photo, EXIF data, location, citizen-selected severity, moderation flags). Merges into a `tickets` row via `ST_DWithin` deduplication — see CLAUDE.md's "Report → Ticket separation."
- **Reads:** Ticket detail page (member reports), `/admin/flagged` moderation queue, dedup/merge logic.
- **Writes:** Citizen report submission (`ReportsService`), moderation actions (`moderation_status`/`moderation_note`/`moderated_at`/`moderated_by`).
- **Expected empty?** No once any report has ever been submitted; normal to be empty on a completely fresh DB before `seed:diverse-reports` or a real submission.
- **Ownership:** Application, but `geom`/`pin_geom`/`exif_geom` are raw-PG-only — not in `schema.ts` (see the header comment there).
- **Indexes:** `reports_geom_idx`/`reports_pin_geom_idx` (GIST, spatial). B-tree: `reports_ticket_id_idx` (join key into `tickets`, used by ticket detail/moderation/merge/dispute lookups), `reports_citizen_id_idx` ("My Reports" and per-citizen lookups), `reports_moderation_status_idx` (moderation queue's default `IS NULL`-pending view) — all added by `api/drizzle/0025_ticket_report_indexes.sql`, none modeled in `schema.ts` per this repo's raw-SQL-migration-owns-indexes convention.

### `tickets`
- **Purpose:** The deduplicated unit admins act on — one ticket can represent multiple merged `reports`. Carries the full urgency/priority scoring output (`urgency_score`, `urgency_band`, `priority_score`, `urgency_level`, `priority_index` — see CLAUDE.md's Severity/Urgency/Priority terminology section for how these differ) plus lifecycle `status` and `assigned_office`.
- **Reads:** Ticket Queue, Map, Dashboard, urgency recompute (`RecomputeService`).
- **Writes:** Ticket creation on first report in an area/category, merge (`member_count`/centroid recompute), status transitions (`StatusHistory` insert alongside), urgency recompute (on-demand, per CLAUDE.md's Urgency triage section), office reassignment.
- **Expected empty?** No once any report has ever been submitted.
- **Ownership:** Application, but `geom` is raw-PG-only (not in `schema.ts`).
- **Indexes:** `tickets_geom_idx` (GIST, spatial). B-tree: `tickets_office_status_idx` (composite, `assigned_office`+`status` — the combined filter shape used by the admin Ticket Queue and most Dashboard queries), `tickets_status_idx` (status-only filtering for queries with no office scope — public hazard map, urgency recompute, escalation cron), `tickets_barangay_id_idx` (barangay-scoped filters/joins) — all added by `api/drizzle/0025_ticket_report_indexes.sql`, none modeled in `schema.ts`.
- **`category`:** Free-form `text`, not a database enum — validated only at the application layer. New submissions validate against `CATEGORIES` in `api/src/contracts/schemas.ts` (12 values, replaced in full by a Phase 3 follow-up — manuscript alignment); admin-side filter/query validation additionally accepts `LEGACY_CATEGORIES` (the 11 pre-follow-up values) via the combined `ALL_CATEGORIES`, since historical tickets still carry them and must stay filterable. Drives automatic office routing at ticket creation (`officeForCategory`/`categoryRouting`, `api/src/common/utils/office.ts`) and the dedup-merge radius (`radiusForCategory`, `api/src/common/utils/radius.ts`); never re-derived after creation. Not nullable. **No historical row's `category` value was changed by the Phase 3 follow-up** — this is an additive validation-list swap, not a backfill; every legacy value keeps working exactly as before in routing, marker/icon display, dashboard distribution, and CSV export.

  Legacy → current semantic mapping (routing/`directResponsibility` intentionally match on both sides — see `office.ts`'s `ROUTING_BY_CATEGORY`):

  | Legacy category | Current equivalent | Office | Direct responsibility |
  |---|---|---|---|
  | `Pothole` | `Pothole / Road Surface Damage` | MEO | Yes |
  | `Clogged Drain` | `Drainage / Culvert / Manhole Issue` | MEO | Yes |
  | `Uneven Sidewalk` | *(unchanged)* | MEO | Yes |
  | `Streetlight Out` | *(unchanged)* | MEO | Yes |
  | `Flooding` | `Localized Flooding` | MDRRMO | Yes |
  | `Fallen Tree` | `Fallen Tree / Storm-Related Obstruction` | MDRRMO | Yes |
  | `Leaking Pipe` | `Leaking Pipe / Water Supply Concern` | MEO | No (Referral) |
  | `Illegal Dumping` | `Illegal Dumping Affecting Drainage or Road` | MEO | No (Referral) |
  | `Overgrown Vegetation` | `Overgrown Vegetation Obstructing Road or Signage` | MEO | No (Referral) |
  | `Other` | `Other Minor Infrastructure Hazard` | MEO | No — aligned to match its current equivalent; a generic "Other" was never a confirmed direct responsibility |
  | `Uncollected Garbage` | *(none — legacy-only)* | MEO | No (Referral) — no longer offered on the citizen form; routine solid-waste collection is outside direct MEO/MDRRMO responsibility unless it's affecting roads/drainage, which `Illegal Dumping Affecting Drainage or Road` now covers |
  | `Soil Erosion` | *(stray seed value, never a validated category)* | MDRRMO | Yes — routed as the closest current equivalent, `Landslide / Slope Failure`, instead of falling through to the generic unknown-category default |
  | *(any other unrecognized string)* | — | MEO | No — never silently treated as normal MEO work |

  New categories with no legacy predecessor: `Landslide / Slope Failure`, `Lahar / Debris-Flow Threat` (both MDRRMO, direct).
- **`assigned_office`:** A genuine Postgres enum (`office`, `MEO`/`MDRRMO` only — `officeEnum` in `schema.ts`), unlike `category`. Set once at creation from `categoryRouting(category).office`; changed afterward only via `office_reassignments`-backed manual reassignment (`POST /admin/tickets/:id/reassign`). Every category also carries a `directResponsibility` flag (computed live from `category`, never stored) distinguishing an office's own direct repair responsibility from a Referral/coordination concern it merely holds custody of — see [`features.md`](features.md) §1.
- **`elevation_factor`/`precipitation_factor`/`cluster_factor`:** The three stored per-factor inputs behind `urgency_score`, each 0–1, rewritten by `RecomputeService.recomputeActiveTicketUrgency` on every recompute (only for tickets in `Reported`/`Under Review`/`In Progress` — resolved/rejected tickets keep whatever they last held). Surfaced as the Ticket Detail urgency decomposition. See [`triage-model.md`](triage-model.md) for what each factor means and the exact formula/weights. `urgency_band` and `urgency_level` are both derived from the same threshold function as of Phase 2 of the manuscript-alignment work — they cannot disagree.
- **`resolution_image_url`/`resolution_notes`:** Set when an admin advances a ticket to `Resolved` through the resolve dialog (`TicketsService`, `POST /admin/tickets/:id/status`). Both are **citizen-visible** — they render in the Case Closure Summary on the citizen's report detail page, so they are staff-authored for a public audience, unlike `work_orders.notes` (internal-only). Nullable: a ticket can be resolved with neither.
- **`disputed_at`/`dispute_reason`:** Citizen resolution-feedback loop, negative path — set by `ReportsService.disputeReport` (`POST /reports/mine/:id/dispute`) when a citizen reports that a `Resolved` ticket isn't actually fixed. `disputed_at` NULL means "not currently disputed" (a single-outstanding-dispute gate, not a history log); it deliberately never rolls `status` back to an earlier value — a workflow signal layered on top of `Resolved`, not a status and not a scoring input (never touches `urgency_score`/`priority_score`/`priority_index`/`urgency_band`). Cleared only by a future re-resolution, which isn't implemented yet. Surfaced on the admin Ticket Queue (a "Disputed only" filter + badge) and Ticket Detail (date + `dispute_reason`), and drives an office-targeted `ticket_disputed` notification.
- **`resolution_confirmed_at`:** Citizen resolution-feedback loop, positive path — set by `ReportsService.confirmResolution` (`POST /reports/mine/:id/confirm-resolution`) when a citizen confirms a `Resolved` ticket actually was fixed. Same gate shape as `disputed_at` (NULL = not yet confirmed); the service rejects confirming an already-disputed ticket, but there's no DB constraint enforcing that mutual exclusivity — both are independent nullable columns. Citizen-only surface (no admin UI reads it — confirmation isn't actionable by an office the way a dispute is, so it was kept out of the admin Ticket Detail response to stay minimal). Never a scoring input, never touches `status`.

### `status_history`
- **Purpose:** Append-only timeline of every ticket status change (`Reported` → `Under Review` → ... ), who changed it and when. Powers the citizen-facing "Pizza Tracker" and the admin ticket-detail timeline.
- **Reads:** Report detail timeline (citizen + admin views).
- **Writes:** Every ticket creation (initial `Reported` row) and every status transition (`TicketsService.advanceStatus`).
- **Expected empty?** No once any ticket exists.
- **Ownership:** Application (Drizzle).
- **Note:** Deliberately separate from `office_reassignments` below — `status` here is a typed `ticket_status` enum column; an office-reassignment event isn't a status value and would corrupt any query reading this table as a pure status timeline (see the in-schema comment on `office_reassignments`).

### `office_reassignments`
- **Purpose:** Append-only log of ticket office reassignments (MEO ↔ MDRRMO), separate from the status timeline for the reason above.
- **Reads:** Ticket detail history (where shown alongside status_history).
- **Writes:** `TicketsService.reassignOffice`.
- **Expected empty?** Normal to have very few or zero rows — reassignment is a rare admin action, not part of every ticket's lifecycle.
- **Ownership:** Application (Drizzle).

### `work_orders`
- **Purpose:** The actual field work MEO/MDRRMO staff must do to resolve a ticket — a ticket may have several work orders. Carries `title`, an internal `notes` progress trail, `assigned_office`/`assigned_admin_id`, its own `work_order_status` (`pending`/`in_progress`/`completed`/`cancelled` — deliberately not `ticket_status`, same reasoning `office_reassignments` doesn't reuse it), `due_date`, and `completed_at`. Advancing or completing a work order never mutates the linked ticket's own `status` — no safe automatic coupling rule exists yet (see [`project-status.md`](project-status.md)).
- **Reads:** `/admin/work-orders` (list, office-scoped), the Work Orders panel on admin Ticket Detail.
- **Writes:** `WorkOrdersService.create`/`update`/`setStatus` (`api/src/admin/work-orders.service.ts`), each logging an `admin_audit_events` row.
- **Expected empty?** Normal to be empty until the first work order is created — not part of every ticket's lifecycle.
- **Ownership:** Application (Drizzle) — no geometry column.
- **Note:** `notes` is internal-only and must never appear in any `api/src/citizens/*` response or the citizen tracking timeline. `assigned_admin_id`/`created_by_admin_id` are FK-less integers, same cross-table reasoning as `status_history.admin_id`/`office_reassignments.admin_id`.

### `work_order_status_history`
- **Purpose:** Append-only status timeline for work orders — what `status_history` is to tickets. `work_orders` stores only the *current* status, so before this table a `pending` → `in_progress` transition left no trace and "how many work orders were pending on date X" was unanswerable (`cancelled` never sets `completed_at`, so even a `created_at`/`completed_at` approximation was wrong). Carries `work_order_id`, the `work_order_status` value, and a write-time `admin_id`/`admin_name` snapshot.
- **Reads:** `DashboardService.getPendingWorkOrderTrend` — the Pending Work Orders KPI sparkline on `/admin`.
- **Writes:** `WorkOrdersService.create` (one origin row, in the same transaction as the INSERT) and `WorkOrdersService.setStatus` (one row per transition, in the same transaction as the UPDATE). Never written anywhere else.
- **Expected empty?** Only before the first work order exists. The migration seeds one origin row per pre-existing work order at its `created_at` with `pending`.
- **Ownership:** Application (Drizzle) — no geometry column.
- **Honesty caveat:** History exists only from migration `0027` forward. Real transitions that happened *before* the migration are unrecoverable and are deliberately not invented — the seeded origin rows only give each pre-existing work order a defined starting point. Early dates in the trend can therefore read high, since a work order completed before the migration still resolves to its seeded `pending` origin. This is documented rather than smoothed over because the alternative is a chart that silently lies about the past.
- **Relation to `admin_audit_events`:** Separate on purpose. The audit log is System-Administrator-only and keyed on *actor*; this table is a metric source keyed on the work order. Deriving the trend from the audit log would couple a dashboard chart to an access-restricted oversight trail.

### `notifications`
- **Purpose:** One row per notification, targeted either at a specific `recipient_id` (an admin or citizen, per `recipient_type`) or at an entire `recipient_office` (admin-only, read by every admin in that office — no per-admin fan-out rows). No FK on `recipient_id` since it points to one of two different tables depending on `recipient_type`.
- **Reads:** Notification bell/list UI (citizen and admin), read by both a specific-recipient query and an office-wide query.
- **Writes:** `NotificationsService.create`/`createInTx`, fired from report submission, moderation, status changes, etc.
- **Expected empty?** Only if nothing notification-worthy has happened yet.
- **Ownership:** Application (Drizzle).
- **Cleanup:** `POST /cron/cleanup-notifications` prunes *read* notifications older than 30 days (unread ones are kept regardless of age until actually read) — called daily by `.github/workflows/cron.yml` (Production Hardening), in addition to being callable on-demand.

### `admin_audit_events`
See §E (System/admin security tables) — kept there since it's specifically part of the admin-security/oversight story, alongside `admins`' own security columns.

### `citizen_audit_events`
- **Purpose:** Append-only trail for the Account & Security page's sensitive actions (OAuth provider linked/unlinked, password set/changed, rejected link conflicts due to email collision). Never updated or deleted, only inserted.
- **Reads:** Citizen's own Account & Security activity view.
- **Writes:** `AccountService`/`ResendEmailService`/OAuth linking flow, on every sensitive action.
- **Expected empty?** Yes for a citizen who has never touched Account & Security beyond initial signup.
- **Ownership:** Application (Drizzle).
- **Relation to `admin_audit_events`:** Intentionally separate — different actor types, different event vocabularies, different audiences (this one is citizen-self-service; the admin one is System-Administrator-only). See §G below for the full cross-table rationale.

---

## B. GIS/PostGIS tables and views

### `barangays`
- **Purpose:** The 29 official PSGC/OCHA-sourced barangay polygons for the target municipality (Porac by default — see `MUNICIPALITY` config). This is where barangay *identity* always comes from — never from `city_boundary_osm` (see below).
- **Reads:** `BarangayService.findBarangayForPoint` (primary `ST_Contains` check + nearest-`<->` fallback snap), admin map choropleth, ticket/report barangay display.
- **Writes:** `pnpm --prefix api import:barangays` (`api/scripts/seed/import-barangays.ts`) — update-by-name, not truncate-and-reinsert, because `tickets.barangay_id` has a real FK to this table.
- **Expected empty?** No — required for the app to function at all (barangay resolution is mandatory for every report). Empty means `import:barangays` was never run.
- **Ownership:** Application, raw-PG-only (not in `schema.ts` — see its header comment). PostGIS provides the `geometry`/`GIST` machinery, but the table itself is app-owned data.
- **Related:** `barangays_gadm_old` — the previous GADM-sourced table, kept for rollback/reference only, never queried by app code. Never delete without reading `docs/migration-log-gadm-to-psgc.md` and `PLAN.md` §4.1 first.

### `dem_points`
- **Purpose:** SRTM 30m digital elevation model, sampled into `(lon, lat, elevation_m)` point rows, one per DEM cell inside a barangay polygon.
- **Reads:** Nearest-neighbor (`<->`) elevation lookup on report submission (`elevation_m` stamped onto the report/ticket); one-time `elev_min`/`elev_max` computation feeding `config` (see §C).
- **Writes:** `pnpm --prefix api seed:dem` (`api/scripts/seed/seed-dem.ts`) — truncate-and-reinsert (idempotent), from `scripts/gis/raw/porac_srtm30m.tif`.
- **Expected empty?** No — required for elevation-based urgency scoring to work at all. Empty means `seed:dem` was never run.
- **Ownership:** Application, raw-PG-only.

### `city_boundary_osm`
- **Purpose:** A single outer-envelope polygon for the whole municipality. Used **only** as a looser second containment check — when a report's coordinates fall outside every barangay polygon (a known gap in the barangay dataset's edges), the app checks whether the point is at least inside the *city as a whole*; if so, it snaps to the nearest barangay by distance instead of rejecting the report outright. Barangay identity is never derived from this table.
- **Reads:** `BarangayService.findBarangayForPoint` (`api/src/domain/barangay.service.ts`), fallback branch only.
- **Writes:** `pnpm --prefix api import:city-boundary` (`api/scripts/seed/import-city-boundary.ts`) — truncate-and-reinsert (idempotent; no FK ever references this table's `id`, unlike `barangays`).
- **Data source:** `MUNICIPALITY.osmBoundaryFile` (default `public/assets/gis/porac_osm_boundary.json`). Despite the "OSM" name, this file is **not** an independent OpenStreetMap import for Porac — it's generated by `pnpm gis:generate-boundary` (`scripts/gis/generate-porac-boundary.ts`), which dissolves the 29 already-imported PSGC barangay polygons into one seamless union via Turf.js. That's deliberately more consistent for this fallback check than a separately-sourced OSM extract would be (no risk of the two datasets disagreeing at the edges). The name is a holdover from the original design (PLAN.md describes a real OSM relation import, done manually, for an earlier target municipality before the PSGC-dissolve approach replaced it).
- **Expected empty?** **This was the actionable gap this document's companion fix addressed.** The table's *creation* (`migrate:city-boundary`) was always a documented setup step, but no committed script ever populated it — so a fresh database following only the old documented steps had this table permanently empty, silently making the fallback branch always reject (any point missing every barangay polygon would be treated as outside the city, with no error or warning anywhere). `import:city-boundary` now exists specifically to fix this; run it (idempotent, safe to re-run) and `verify:city-boundary` to confirm. If it's still empty after running that script, that's a real problem worth investigating, not a normal state.
- **Ownership:** Application, raw-PG-only.

### `geometry_columns`
- **Purpose:** PostGIS system catalog view, auto-populated by `CREATE EXTENSION postgis`. Lists every `geometry`-typed column in the database for tooling introspection (QGIS, `ogr2ogr`, spatial-reference lookups). The app never queries it.
- **Reads/writes:** None by app code. Populated automatically whenever a `geometry` column is created/dropped.
- **Expected empty?** No — it should list an entry for every real spatial column this app has (`barangays.geom`, `dem_points.geom`, `tickets.geom`, `reports.geom`/`pin_geom`/`exif_geom`, `city_boundary_osm.geom`, `rate_limit_events.geom`). If it's empty, PostGIS itself is broken, not this app.
- **Ownership:** PostGIS extension / system metadata.
- **Never manually delete.**

### `geography_columns`
- **Purpose:** Same as `geometry_columns`, but for `geography`-typed columns.
- **Expected empty? Yes, and this is normal** — this app never declares a column as `geography`; every spatial column is `geometry`. `geography` only ever appears as an inline cast in query text (e.g. `geom::geography` in `barangay.service.ts`/`ratelimit.service.ts`, used for accurate meter-based `ST_Distance`/`ST_DWithin` calculations). A cast is not a column declaration, so it never populates this view. An empty `geography_columns` is expected and correct — it is not evidence of missing setup.
- **Ownership:** PostGIS extension / system metadata.
- **Never manually delete.**

---

## C. Configuration and scoring tables

### `config`
- **Purpose:** A small key-value cache table serving two related-but-distinct concerns:
  - **`elev_min` / `elev_max`** — fixed, DEM-derived elevation bounds used to normalize the urgency formula's elevation factor. Computed once from `dem_points` at seed/migration time (`drizzle/0007_config.sql`), read by `AppConfigService.getElevationBounds()`. **Never recomputed live** — these are static application configuration, not live state.
  - **`rain_1h_mm`** — a live OpenWeatherMap cache, ~10-minute TTL, read/written by `WeatherService.getCurrentRain1hMm()`. This *is* live runtime telemetry, refreshed on-demand by any admin dashboard/ticket-queue/map load (which recomputes urgency) and by the manual `POST /cron/recompute-weather` trigger. On fetch failure it falls back to the stale cached value (or `0mm` if there's never been one) rather than erroring, so a weather-API outage doesn't 500 every admin route.
- **Reads:** `AppConfigService` (elevation bounds), `WeatherService` (rain cache).
- **Writes:** `WeatherService` (rain cache, every ~10 min on read-triggered refresh); `elev_min`/`elev_max` are written exactly once, at seed time, by migration SQL — no runtime code writes them.
- **Expected empty?** No — `elev_min`/`elev_max` are load-bearing for every urgency computation; a missing row here would corrupt scoring. Empty means `seed:dem` + `migrate:config` were never run (missing setup), not evidence this feature is unused.
- **Ownership:** Application, raw-PG-only.
- **Design note (future consideration only — not changed by this pass):** This table currently mixes a static-constant role and a live-telemetry-cache role under one shape. That's fine at its current size (3 rows) but is a candidate for eventually splitting into e.g. `elevation_config` (static) and `weather_cache` (live, TTL'd) if the number of config keys ever grows enough that the dual purpose becomes confusing. Not attempted in this pass — see the database audit for the full rationale.

---

## D. Authentication/security tables

### `citizen_identities`
- **Purpose:** One row per (citizen, external OAuth provider) link. Google is the only provider the app currently issues (Facebook enum value retained only because Postgres can't cheaply drop an enum value — no live code path uses it). A citizen can hold at most one identity per provider; a given provider account can only ever back one citizen.
- **Reads:** OAuth login (identity lookup), Account & Security page (linked-provider list).
- **Writes:** OAuth callback (link/first-login), Account & Security unlink action.
- **Expected empty?** Normal to be empty if no citizen has ever used Google login — password-based signup never touches this table.
- **Ownership:** Application (Drizzle).

### `password_reset_tokens`
- **Purpose:** One row per issued citizen password-reset link. Only a SHA-256 hash of the actual token is stored (the raw token exists only in the emailed URL and the requesting citizen's browser) — `token_hash` is the lookup key precisely because it's useless to an attacker who reads the database. `used_at` makes it single-use; `expires_at` makes it short-lived.
- **Reads:** `PasswordResetService`, on the reset-link-click flow.
- **Writes:** `POST /citizens/forgot-password` (insert), reset completion (`used_at`).
- **Expected empty?** Normal to be near-empty most of the time — tokens are short-lived and single-use.
- **Ownership:** Application (Drizzle).
- **Cleanup:** `POST /cron/cleanup-password-reset-tokens` prunes expired/used tokens — called daily by `.github/workflows/cron.yml` (Production Hardening), in addition to being callable on-demand.

### `rate_limit_events`
- **Purpose:** Postgres-backed rate limiter for **report submission only**. Three independent checks: per-citizen hourly cap (primary), per-citizen spatial cap (3 within 25m/24h — catches repeat submissions near the same spot), per-IP hourly backstop (secondary, catches one IP spinning up many accounts).
- **Reads/writes:** `RateLimitService.checkRateLimit`/`recordRateLimitEvent` — the write happens inside the same transaction as the ticket/report insert, so only successful submissions count against the limit.
- **Expected empty?** Normal on a fresh DB before any report has been submitted; grows with every submission attempt otherwise.
- **Ownership:** Application, raw-PG-only (has a `geom` column, `NOT NULL`).
- **Cleanup:** `POST /cron/cleanup-rate-limit-events` (`RateLimitService.cleanupOldEvents`) prunes rows older than 30 days — called daily by `.github/workflows/cron.yml`. 30 days is a wide safety margin over the longest window this table's checks ever query (24 hours, the per-citizen spatial check), so it can never delete a row a live rate-limit decision still depends on.

### `password_reset_rate_limit_events`
- **Purpose:** A **separate** rate limiter, specifically for the forgot-password endpoint (`POST /citizens/forgot-password`) — per-email (primary, 3/hour) and per-IP (secondary backstop, 10/hour). Records a row for *every* attempt, including ones for emails that don't exist, so enumeration probing can't dodge the limit by trying many addresses.
- **Reads/writes:** `RateLimitService.checkPasswordResetRateLimit`/`recordPasswordResetAttempt`.
- **Why separate from `rate_limit_events`:** That table's `geom` column is `NOT NULL` — a forgot-password request has no location. Forcing this event into the geo table would mean either fake placeholder geometry (bad data) or relaxing that table's `NOT NULL` constraint (weakening its real use case). The separation is a direct consequence of a real schema constraint, not arbitrary duplication — **do not merge these two tables.**
- **Expected empty?** Normal on a fresh DB before any forgot-password request has been made.
- **Ownership:** Application, raw-PG-only (no geometry).
- **Cleanup:** Same `POST /cron/cleanup-rate-limit-events` call prunes this table too (30-day cutoff) — both tables' checks only ever query 1-hour windows, so the same wide margin applies here even more comfortably than for `rate_limit_events` above.

### `admin_login_rate_limit_events`
- **Purpose:** Per-account failed-login throttling for admin login (R1) — keyed on the normalized account email only, never IP (an IP-based total-login limit would break the E2E suite, which authenticates from one IP nearly 200 times per run). 10 failures within 15 minutes throttles further attempts against that email. Only failed attempts are recorded; a successful login deletes that email's rows outright rather than waiting for them to age out — the one table in this app whose rate limiting actively resets rather than only expiring.
- **Reads/writes:** `RateLimitService.checkAdminLoginRateLimit`/`recordAdminLoginFailure`/`resetAdminLoginFailures`, called from `AuthService.adminLogin`. A failure is recorded for every rejection reason — nonexistent email, deactivated admin, wrong password — never only for real/active accounts, so the throttle itself can't become an enumeration side-channel (mirrors `recordPasswordResetAttempt`'s identical choice).
- **Why separate from `password_reset_rate_limit_events`** even though the column shape is identical: that table is a different security domain already in active use by citizen forgot-password requests (its own email/IP limits). Mixing admin-login-failure rows into it would corrupt those counts and conflate two unrelated actor types — the same category of mistake `rate_limit_events`/`password_reset_rate_limit_events` staying separate already guards against, just one level over.
- **Expected empty?** Normal on a fresh DB, and in steady state — it only holds rows for accounts currently mid-throttle or between failures and their next success.
- **Ownership:** Application, raw-PG-only style access (Drizzle-declared for schema documentation, but always queried via the raw `Sql` client, same as `password_reset_rate_limit_events`).
- **Cleanup:** Same `POST /cron/cleanup-rate-limit-events` call prunes this table too (30-day cutoff) — its own check only ever queries a 15-minute window, so the margin here is wider still than either sibling table's.

### `citizen_login_rate_limit_events`
- **Purpose:** Per-account failed-login throttling for citizen login (hardening item 3) — identical shape and reasoning to `admin_login_rate_limit_events`: keyed on normalized email only, never IP (the E2E suite's `signupCitizen()` fixtures log in from one shared local IP across specs). 10 failures within 15 minutes throttles further attempts against that email; a successful login deletes that email's rows outright.
- **Reads/writes:** `RateLimitService.checkCitizenLoginRateLimit`/`recordCitizenLoginFailure`/`resetCitizenLoginFailures`, called from `AuthService.citizenLogin`. A failure is recorded for every rejection reason — nonexistent citizen, OAuth-only account (null password hash), wrong password — never only for real accounts.
- **Why separate from `admin_login_rate_limit_events`** even though the column shape is identical: different security domain (citizen vs. admin accounts), same reasoning as every other pair in this section — see §G.
- **Expected empty?** Normal on a fresh DB, and in steady state — only holds rows for accounts currently mid-throttle or between failures and their next success.
- **Ownership:** Application, raw-PG-only style access (Drizzle-declared for schema documentation, always queried via the raw `Sql` client).
- **Cleanup:** Same `POST /cron/cleanup-rate-limit-events` call prunes this table too (30-day cutoff).

### `citizen_signup_rate_limit_events`
- **Purpose:** Account-creation-spam throttling for citizen signup (hardening item 3) — IP-only, no email column, since signup abuse is bounded by volume of *distinct* new accounts from one source rather than repeat attempts against one target address (duplicate email is already rejected by the existing `citizens.email` conflict check, unrelated to this table). 20 signups within 1 hour per IP — the same value as `rate_limit_events`' IP backstop, sized against the E2E suite's actual measured signup volume (~17 disposable citizen accounts per full run) rather than picked arbitrarily.
- **Reads/writes:** `RateLimitService.checkCitizenSignupRateLimit`/`recordCitizenSignupAttempt`, called from `AuthService.citizenSignup`. An attempt is recorded for every request that clears the rate-limit check itself, regardless of whether it goes on to hit the duplicate-email conflict or succeed.
- **Expected empty?** Normal on a fresh DB before any signup has been attempted.
- **Ownership:** Application, raw-PG-only style access (Drizzle-declared for schema documentation, always queried via the raw `Sql` client).
- **Cleanup:** Same `POST /cron/cleanup-rate-limit-events` call prunes this table too (30-day cutoff) — its own check only ever queries a 1-hour window.

### `verifications`
- **Purpose:** **Not email/account verification.** This is planned/future schema for a citizen "upvote a ticket" signal — one row per (ticket, citizen) attesting "I also see this problem," intended as a possible future input to the urgency formula's Cluster Density factor (per `PLAN.md`'s explicit "keep and formalize" note). The feature that would write to this table has never been built.
- **Reads/writes:** None — no service, controller, or test touches it. It exists in `schema.ts` only.
- **Expected empty?** Yes, always, until this feature is actually built. This is not evidence of dead/leftover-and-forgotten schema — it's a deliberate, documented decision (see `PLAN.md`) to keep the table rather than build-then-delete-then-rebuild later.
- **Naming caveat:** `citizen_id` on this table is typed `text`, not the `integer references citizens(id)` every other citizen-referencing column uses — it predates the `citizens` table (added two migrations later). If this table is ever wired up, that column needs a type migration first.
- **Ownership:** Application (Drizzle).
- **Do not delete** without first re-reading `PLAN.md`'s "Keep and formalize: citizen verifications" note and confirming the product decision has actually changed.

---

## E. System/admin security tables

### `admin_audit_events`
- **Purpose:** Append-only trail for administrative actions — account create/role change/deactivate/reactivate, ticket status/reassignment/referral/rejection, report moderation, work order create/update/status change, and admin login/failed-login (`admin_login`/`admin_login_failed`). System-Administrator-visible only. `actor_*` columns are a snapshot at write time (name/role/office can change later on the `admins` row itself), so history reads correctly even after the actor is edited. `action_type`/`target_type` are plain `text`, not enums — a new action type is a pure application-code change, no migration required (e.g. `ticket_referral_noted`'s `metadata: { agency, note }`, Phase 3; `ticket_rejected`'s `metadata: { from, to: 'Rejected', reason }`, Phase 4). Read back per-ticket on the Ticket Detail page as a **historical** referral list — never treated as live "currently pending referral" state, since reconstructing that from an event log would need a resolution-event convention this table doesn't have. **The `ticket_rejected` reason lives only in this table's `metadata` column — `tickets` has no `rejection_reason` column and none was added for this.** Deliberate: audit metadata may document an action without becoming authoritative live ticket state (same reasoning as the referral agency/note above); a citizen sees the reason only inside the rejection notification/email text, never as a queryable ticket field.
- **Reads:** Activity Log page (`GET /admin/activity-log`, System Admin only).
- **Writes:** `AdminAuditService.logInTx`/`logInPgTx`, called from every admin-management/ticket/moderation write path that changes state — the write is transactional with the state change itself (a failed audit insert rolls back the whole action; this trail is treated as load-bearing, not best-effort). **Exception:** `admin_login`/`admin_login_failed` are written via `AdminAuditService.logBestEffort` from `AuthService.adminLogin`, outside any transaction and best-effort (errors are caught and logged, never rethrown) — login has no accompanying state-change transaction to join, and a broken audit insert must never block a legitimate login. A failed login against a nonexistent email is not audited at all: `actor_admin_id` is `NOT NULL` and there is no admin row to attribute one to.
- **Expected empty?** No once any admin action has been taken; normal to be empty on a completely fresh DB.
- **Ownership:** Application (Drizzle).
- **Relation to `citizen_audit_events`:** Intentionally separate — see §G.

### Admin password/session security columns (on `admins`)
- **`password_changed_at`** — set/refreshed whenever `password_hash` changes (own change or a System Admin reset).
- **`session_valid_after`** — bumped to `now()` on the same two events; `SessionService.verifyAdminSession` rejects any JWT whose `iat` predates this value — the one place a stateless JWT admin session can actually be invalidated server-side after a credential change. `null` means "never invalidated, accept any `iat`" (the default for every existing/new admin).
- **Mirrors:** `citizens.password_changed_at`/`session_valid_after`, same mechanism, same reasoning, applied to the other principal type.

### Admin activation/deactivation status (on `admins`)
- **`is_active`** — `false` blocks login (`AuthService.adminLogin`) and invalidates every existing session immediately (deactivation bumps `session_valid_after` in the same write, so an already-issued JWT dies within the request cycle, not just at its 8h expiry). Reactivation only flips this back; the admin logs in fresh with their existing password.
- **Lockout protection:** `AdminsService.setActive` blocks deactivating the last **active** `system_admin` (mirrors the equivalent role-demotion lockout) — the system can never end up with zero admins able to manage other admins.
- **No `citizens.is_active` equivalent** — intentional, not missing work. Citizens are self-service accounts; there is no "deactivate a staff account" workflow in the product for them.

---

## F. Naming/terminology callouts

- **`verifications` ≠ email/account verification.** See §D — it's a planned ticket-upvote feature, unrelated to identity verification.
- **`urgency_score`/`urgency_band` ≠ `priority_score`/`urgency_level` ≠ `priority_index`.** All live on `tickets`, all sound similar, and are genuinely different things — see CLAUDE.md's "Terminology: Severity vs. Urgency vs. Priority" section for the authoritative explanation. Not repeated in full here to avoid the two documents drifting out of sync; when scoring changes, update CLAUDE.md first.

---

## G. Cross-table design notes

- **`rate_limit_events` vs. `password_reset_rate_limit_events`** — keep separate; driven by a real `NOT NULL geom` constraint difference, not duplication. See §D.
- **`password_reset_rate_limit_events` vs. `admin_login_rate_limit_events` vs. `citizen_login_rate_limit_events`** — identical or near-identical column shapes, kept separate anyway: different security domains (citizen forgot-password, admin login, citizen login) with independent limits and independent actor types. Merging any of them would let one domain's attempts count against another's threshold. See §D.
- **`citizen_signup_rate_limit_events`** — IP-only, no email column, unlike its login/reset/admin-login siblings; not a shape mismatch to reconcile, a deliberate consequence of signup's different threat model (volume from a source, not repeat attempts against a target). See §D.
- **`admin_audit_events` vs. `citizen_audit_events`** — keep separate; different actor types, different event vocabularies, different audiences (System-Administrator-only vs. citizen-self-service), each independently documenting the same "actor snapshot at write time" pattern for its own reasons.
- **`admins`' security/session/status columns vs. `citizens`' security/session columns** — parallel by design, not accidentally duplicated; each principal type owns its own copy so one type's auth model can evolve (e.g. admin deactivation) without silently changing the other's.
- **`config` vs. weather/telemetry state** — currently share one table; see §C's design note. Not split in this pass.
- **`city_boundary_osm` vs. static GeoJSON assets** — no real overlap. The frontend map's boundary overlay and this table's fallback-containment check happen to read from the same underlying generated file (`porac_osm_boundary.json`), but for different reasons (rendering vs. spatial query) and through different mechanisms (a browser `fetch` vs. a database `ST_Contains`) — this is reuse of one source of truth, not confusing overlap.
