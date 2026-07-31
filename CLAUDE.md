# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo layout

This is a two-app monorepo (see the NestJS extraction blueprint decision record for the full phase-by-phase history):

- **root** — Next.js, UI only. Server Components fetch from the NestJS API via `lib/api-client.ts`; the browser talks to it through `next.config.ts`'s `/api/*` rewrite proxy. `app/api/**` no longer exists — every route lives in `api/`.
- **`api/`** — NestJS, owns the database, auth, PostGIS spatial work, and the triage engine. Own `package.json`/`tsconfig.json`/`nest-cli.json`. Run `npm --prefix api run start:dev` (or `cd api && npm run start:dev`) for local dev, `:3001` by default.
- `PLAN.md` — the authoritative build log and decision record (gap analysis vs. the original thesis paper, phase-by-phase status, every architectural deviation and why). Read it before making non-trivial changes to the triage engine, dedup logic, or geo pipeline — it explains *why* things are built the way they are, not just what.
- `docs/migration-log-gadm-to-psgc.md` — archived copy of a deleted one-time migration script, kept for history only.
- `angeles_psgc.json`, `angeles_city_srtm30m.tif` — raw geo source data consumed by the seed scripts in `scripts/`. Not committed data-processing artifacts you should ever hand-edit; regenerate via the pipeline described below if the target municipality changes.

`lib/` still holds a handful of DB-touching modules (`lib/db/*`, `lib/geo/*`, `lib/triage/recompute.ts`/`radius.ts`, `lib/config.ts`, `lib/cloudinary.ts`, `lib/exif.ts`, `lib/phash.ts`, `lib/ratelimit.ts`, `lib/office.ts`, `lib/scoring.ts`, `lib/weather/*`) — these are **not** used by the running Next app anymore, only by the one-time setup scripts in `scripts/` (below), which haven't been relocated into `api/` yet. Everything else under `lib/admin/*` and `lib/citizens/*` was stripped down to pure `export interface`/`export type` declarations once their query functions were ported to `api/src/`; the frontend only ever `import type`s from them now, never their (now-deleted) functions.

## Commands (root, Next.js UI)

```
npm run dev              # dev server (:3000)
npm run build             # production build
npm run lint               # eslint
```

## Commands (`api/`, NestJS backend)

```
npm --prefix api run start:dev    # dev server (:3001), or cd api && npm run start:dev
npm --prefix api run build        # nest build
npm --prefix api test              # jest unit tests
npm --prefix api run test:e2e      # jest e2e tests
```

Database setup order (one-time, run from **root**, against `DATABASE_URL` in `.env.local`):
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

These still live in root `scripts/` (not yet moved into `api/`) and run via `tsx --env-file=.env.local`, so env vars come from that file, not the shell. `api/.env` needs the **same** `DATABASE_URL`/`JWT_SECRET`/`CLOUDINARY_URL`/`OPENWEATHERMAP_API_KEY` values (see `api/.env.example`) — two separate env files, one shared set of secrets.

## This is a modified Next.js — verify before assuming standard APIs

`AGENTS.md` (root) warns that this Next.js build has breaking conventions vs. what training data assumes. One concrete example already found: middleware lives in `proxy.ts` (exporting `proxy()`), not `middleware.ts`/`export function middleware()`. Check `node_modules/next/dist/docs/` before relying on a remembered Next.js API or file-convention name.

## Architecture

**Two apps, one Postgres.** Root Next.js renders UI only — no `app/api/**` handlers, no direct DB queries from Server Components. `api/` (NestJS) owns every route, the database, auth, PostGIS, and the triage engine; Server Components call it via `lib/api-client.ts` (forwards the session cookie manually, `cache: "no-store"` since urgency/weather are live-recomputed per request), and the browser calls it through the `/api/*` rewrite in `next.config.ts` so cookies stay first-party. `proxy.ts` still runs on the Next side purely for the page-redirect UX (`/admin/*` → `/admin/login`, citizen pages → `/login`) — it duplicates nothing API-auth-related anymore, since NestJS's `AdminSessionGuard`/`CitizenSessionGuard` are the real gate.

**Two ORMs by column type, not by table** (inside `api/src/`). Drizzle (`api/src/db/schema.ts`) manages every non-geometry column. Any table or query touching a `geometry` column (`barangays.geom`, `dem_points.geom`, `tickets.geom`, `reports.geom`/`pin_geom`/`exif_geom`) goes through raw tagged-template SQL via the `PG` postgres.js client (`api/src/db/db.module.ts`) instead, because Drizzle's PostGIS support is too weak for `ST_*` functions. When adding a column, decide which client it belongs to based on whether it's geometry — don't add geometry handling to Drizzle. (Root `lib/db/*` is the same split, kept only for the setup scripts in `scripts/` — see Repo layout above.)

**Report → Ticket separation.** `reports` (one per citizen submission) merge into `tickets` (the deduplicated unit admins act on) via `ST_DWithin` within a category-specific radius (`api/src/domain/radius.ts`) and a 7-day active window. Merging increments `tickets.member_count` and recomputes the ticket centroid — this is why urgency scoring reads from `tickets`, not `reports`. The merge transaction uses a `pg_advisory_xact_lock` keyed on `(category, barangay_id)` rather than `SELECT ... FOR UPDATE`, because the latter hits a Postgres planner limitation when combined with `<->` KNN ordering (see `PLAN.md` §6).

**Urgency triage** (`api/src/domain/urgency.ts`, `api/src/domain/recompute.service.ts`): `urgency_score = (1/3 × elevationFactor) + (1/3 × precipitationFactor) + (1/3 × clusterFactor)`, banded Low/Medium/Critical at 0.4/0.7. Elevation is inverse-normalized against city-wide `elev_min`/`elev_max` (fixed constants computed once at DEM-seed time via `api/src/domain/app-config.service.ts`, never recomputed live). Precipitation is real `rain["1h"]` mm from OpenWeatherMap, capped at the PAGASA 30mm/h torrential threshold, cached ~10min in the `config` table (`api/src/domain/weather.service.ts`) — not in-memory, so it survives cold starts/restarts and is shared across routes. Recompute is triggered on-demand (admin dashboard/ticket-list/ticket-detail load, `GET /admin/tickets`/`/admin/tickets/geo`/`/admin/tickets/:id`/`/admin/dashboard`), plus two explicit manual triggers behind `CronSecretGuard`: `POST /cron/recompute-urgency` and `POST /cron/recompute-weather` (`api/src/cron/`) — not on a real cron schedule, since NestJS being a long-lived process removed the Vercel-Hobby once-daily-cron constraint that originally motivated on-demand-only recompute, but nothing schedules them yet.

**Barangay resolution** (`api/src/domain/barangay.service.ts`) is a two-stage lookup: strict `ST_Contains` against `barangays` (PSGC/OCHA-sourced, ~130 avg vertices/polygon) first; if that misses, check `ST_Contains` against `city_boundary_osm` (an independent OSM outer-boundary import) — if inside, snap to the nearest barangay via `ST_Distance`/`<->` rather than rejecting, and flag the report `BOUNDARY_FALLBACK:<name>:<distanceM>`; if outside even that, reject as outside city limits. Barangay *identity* always comes from the PSGC table, never from OSM — OSM is only the outer accept/reject envelope. The old GADM-sourced table survives as `barangays_gadm_old` for rollback/reference (not queried by app code) — GADM was replaced because its ~7.6-avg-vertex polygons misregistered real addresses by up to 1.8km (`PLAN.md` §4.1 has the full validation writeup).

**Municipality is a config value, not a hardcoded assumption.** `MUNICIPALITY` (name, PSGC code, barangay count, city-center lat/lng, source data filenames) is read from env vars with Angeles City defaults — duplicated deliberately on both sides (`lib/municipality-config.ts` for the Next map components + `scripts/`, `api/src/domain/municipality-config.ts` for the API), since `TARGET_*` needs to be set identically in both `.env.local` and `api/.env`. Swapping the target LGU is an env-var change plus re-running the seed pipeline with new source files — not a code edit — but the source data (PSGC shapefile filter, SRTM clip, OSM boundary) still needs re-acquiring and empirically re-validated per city; nothing guarantees a new city's PSGC data is as clean as Angeles' turned out to be.

**Two auth systems, deliberately separate.** Admin sessions and citizen sessions (`api/src/auth/session.service.ts`) are independent JWTs (via `jose`), signed with an `aud` claim (`'admin'`/`'citizen'`) so a token from one cookie can never half-verify as the other. `AdminSessionGuard`/`CitizenSessionGuard` gate every API route; `proxy.ts` (root) keeps its own lightweight `verifySession`/`verifyCitizenSession` (`lib/auth/session.ts`/`citizenSession.ts`) purely for the page-redirect UX, sharing the same `JWT_SECRET`. There is no guest/anonymous reporting — citizen accounts are required (a deliberate deviation from the original plan, see `PLAN.md` §9/§16).

**Fraud/integrity flags** (EXIF mismatch, stale photo, no EXIF, perceptual-hash duplicate, boundary fallback) never block submission — they append to `reports.flags[]` and route to `/admin/flagged` for human review, matching the "decision support, not gatekeeper" framing in `PLAN.md`. Elevation is always server-computed from `dem_points` (nearest-neighbor `<->` query), never trusted from client input.
