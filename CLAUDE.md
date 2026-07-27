# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo layout

This is a monorepo root, not the app itself. The actual app lives in `ac-core-nextjs/`; all commands below run from there. Other root-level items:

- `PLAN.md` — the authoritative build log and decision record (gap analysis vs. the original thesis paper, phase-by-phase status, every architectural deviation and why). Read it before making non-trivial changes to the triage engine, dedup logic, or geo pipeline — it explains *why* things are built the way they are, not just what.
- `docs/migration-log-gadm-to-psgc.md` — archived copy of a deleted one-time migration script, kept for history only.
- `angeles_psgc.json`, `angeles_city_srtm30m.tif` — raw geo source data consumed by the seed scripts in `ac-core-nextjs/scripts/`. Not committed data-processing artifacts you should ever hand-edit; regenerate via the pipeline described below if the target municipality changes.

## Commands (run from `ac-core-nextjs/`)

```
npm run dev              # dev server
npm run build             # production build
npm run lint               # eslint
```

There is no test suite (`.test.ts`/`.spec.ts`) anywhere in the app — don't assume one exists when asked to "run the tests."

Database setup order (one-time, against `DATABASE_URL` in `.env.local`):
```
npm run migrate                    # non-spatial Drizzle tables
npm run migrate:geometry           # geometry columns + GiST indexes
npm run migrate:ratelimit
npm run migrate:ratelimit-citizen
npm run migrate:city-boundary
npm run import:barangays-v2        # PSGC barangay polygons -> barangays_v2
npm run import:city-boundary       # OSM outer boundary -> city_boundary_osm
npm run seed:dem                   # SRTM GeoTIFF -> dem_points
npm run verify:config               # print computed elev_min/elev_max etc.
npm run seed:admin -- <email> <password> <CEO|ACDRRMO> <officer|supervisor>
npm run seed:demo                   # idempotent demo tickets/citizens
```

All scripts run via `tsx --env-file=.env.local`, so env vars come from that file, not the shell.

## This is a modified Next.js — verify before assuming standard APIs

`AGENTS.md` (included via `ac-core-nextjs/CLAUDE.md`) warns that this Next.js build has breaking conventions vs. what training data assumes. One concrete example already found: middleware lives in `proxy.ts` (exporting `proxy()`), not `middleware.ts`/`export function middleware()`. Check `node_modules/next/dist/docs/` before relying on a remembered Next.js API or file-convention name.

## Architecture

**No separate backend.** Despite `PLAN.md` discussing Express/NestJS, the actual app is Next.js API routes only (`app/api/**/route.ts`) talking directly to Postgres — there is no Express/NestJS layer anywhere in this build.

**Two ORMs by column type, not by table.** Drizzle (`lib/db/schema.ts`, `lib/db/index.ts`) manages every non-geometry column. Any table or query touching a `geometry` column (`barangays.geom`, `dem_points.geom`, `tickets.geom`, `reports.geom`/`pin_geom`/`exif_geom`) goes through raw tagged-template SQL via `lib/db/raw.ts` (`postgres.js`) instead, because Drizzle's PostGIS support is too weak for `ST_*` functions. When adding a column, decide which client it belongs to based on whether it's geometry — don't add geometry handling to Drizzle.

**Report → Ticket separation.** `reports` (one per citizen submission) merge into `tickets` (the deduplicated unit admins act on) via `ST_DWithin` within a category-specific radius (`lib/triage/radius.ts`) and a 7-day active window. Merging increments `tickets.member_count` and recomputes the ticket centroid — this is why urgency scoring reads from `tickets`, not `reports`. The merge transaction uses a `pg_advisory_xact_lock` keyed on `(category, barangay_id)` rather than `SELECT ... FOR UPDATE`, because the latter hits a Postgres planner limitation when combined with `<->` KNN ordering (see `PLAN.md` §6).

**Urgency triage** (`lib/triage/urgency.ts`, `lib/triage/recompute.ts`): `urgency_score = (1/3 × elevationFactor) + (1/3 × precipitationFactor) + (1/3 × clusterFactor)`, banded Low/Medium/Critical at 0.4/0.7. Elevation is inverse-normalized against city-wide `elev_min`/`elev_max` (fixed constants computed once at DEM-seed time via `lib/config.ts`, never recomputed live). Precipitation is real `rain["1h"]` mm from OpenWeatherMap, capped at the PAGASA 30mm/h torrential threshold, cached ~10min in the `config` table (`lib/weather/openweather.ts`) — not in-memory, so it survives serverless cold starts and is shared across routes. Recompute is triggered on-demand (admin dashboard/map load), not on a cron: Vercel Hobby only allows once-daily cron, which would defeat the "live re-ranking as a storm moves in" behavior. `app/api/cron/recompute/route.ts` is a manual, `CRON_SECRET`-gated fallback trigger only.

**Barangay resolution** (`lib/geo/barangay.ts`) is a two-stage lookup: strict `ST_Contains` against `barangays` (PSGC/OCHA-sourced, ~130 avg vertices/polygon) first; if that misses, check `ST_Contains` against `city_boundary_osm` (an independent OSM outer-boundary import) — if inside, snap to the nearest barangay via `ST_Distance`/`<->` rather than rejecting, and flag the report `BOUNDARY_FALLBACK:<name>:<distanceM>`; if outside even that, reject as outside city limits. Barangay *identity* always comes from the PSGC table, never from OSM — OSM is only the outer accept/reject envelope. The old GADM-sourced table survives as `barangays_gadm_old` for rollback/reference (not queried by app code) — GADM was replaced because its ~7.6-avg-vertex polygons misregistered real addresses by up to 1.8km (`PLAN.md` §4.1 has the full validation writeup).

**Municipality is a config value, not a hardcoded assumption.** `lib/municipality-config.ts`'s `MUNICIPALITY` object (name, PSGC code, barangay count, city-center lat/lng, source data filenames) is read from env vars with Angeles City defaults. Seed scripts, `lib/weather/openweather.ts`, and the citizen-facing map components all read from it. Swapping the target LGU is an env-var change plus re-running the seed pipeline with new source files — not a code edit — but the source data (PSGC shapefile filter, SRTM clip, OSM boundary) still needs re-acquiring and empirically re-validated per city; nothing guarantees a new city's PSGC data is as clean as Angeles' turned out to be.

**Two auth systems, deliberately separate.** Admin sessions (`lib/auth/session.ts`) and citizen sessions (`lib/auth/citizenSession.ts`) are independent JWTs (via `jose`, edge-compatible) in different cookies, both verified in `proxy.ts`. There is no guest/anonymous reporting — citizen accounts are required (a deliberate deviation from the original plan, see `PLAN.md` §9/§16).

**Fraud/integrity flags** (EXIF mismatch, stale photo, no EXIF, perceptual-hash duplicate, boundary fallback) never block submission — they append to `reports.flags[]` and route to `/admin/flagged` for human review, matching the "decision support, not gatekeeper" framing in `PLAN.md`. Elevation is always server-computed from `dem_points` (nearest-neighbor `<->` query), never trusted from client input.
