# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo layout

This is a two-app monorepo (see the NestJS extraction blueprint decision record for the full phase-by-phase history):

- **root** — Next.js, UI only. Server Components fetch from the NestJS API via `lib/api-client.ts`; the browser talks to it through `next.config.ts`'s `/api/*` rewrite proxy. `app/api/**` no longer exists — every route lives in `api/`. Non-page components live in top-level `components/{ui,layouts,features}/`, not colocated in `app/**` — only `page.tsx`/`layout.tsx`/`loading.tsx`/`error.tsx`/`route.ts`/`not-found.tsx` remain under `app/`.
- **`api/`** — NestJS, owns the database, auth, PostGIS spatial work, and the triage engine. Own `package.json`/`tsconfig.json`/`nest-cli.json`. Run `pnpm --prefix api start:dev` (or `cd api && pnpm start:dev`) for local dev, `:3001` by default. `api/src/common/` holds cross-cutting guards, decorators, and pure utils (`office`/`radius`/`distance`/`scoring`) shared across the `admin`/`auth`/`cron`/`reports` feature modules. `api/scripts/` holds the one-time DB migration/seed/verify scripts (moved from root `scripts/`) plus `api/drizzle/` for the Drizzle migration SQL — see Commands below.
- `PLAN.md` — the authoritative build log and decision record (gap analysis vs. the original thesis paper, phase-by-phase status, every architectural deviation and why). Read it before making non-trivial changes to the triage engine, dedup logic, or geo pipeline — it explains *why* things are built the way they are, not just what.
- `docs/migration-log-gadm-to-psgc.md` — archived copy of a deleted one-time migration script, kept for history only.
- `docs/project-status.md` — the **only** active project status and roadmap file: current phase, shipped record, current queue, deferred items, do-not-build rules, and risks. Check it before proposing work and update it in the same change when anything changes state. There is no other roadmap or backlog file; do not create one.
- `docs/database.md` — plain-English reference for every table/view in the schema (purpose, read/write paths, expected-empty state, PostGIS vs. application ownership). See "Database documentation" below.
- `docs/features.md` — what the system currently does: citizen and admin flows, the spatial decision-support behaviors, and an explicit "not built / pending" section. Every flow cites the route, service, or spec that implements it. Read it for orientation before changing a user-facing surface.
- `docs/user-flows.md` — role-by-role narrative walkthrough (citizen, MEO, MDRRMO, System Administrator) plus an end-to-end scenario and the data-visibility boundaries. `docs/features.md` is the inventory; this is how the system is actually used.
- `docs/triage-model.md` — the authoritative reference for the scoring model: both formulas (`urgency_score` and the separate `priority_index`), exact weights and thresholds, the known `urgency_band` vs `urgency_level` discrepancy, missing-data behavior, and honest limitations. Read it before touching `api/src/domain/urgency.ts` or `api/src/common/utils/scoring.ts` — it also carries the change-control rule for keeping the frontend duplicates and tests in sync.
- `docs/testing.md` — the full testing reference: every test layer and its command, what CI runs (no Playwright), the E2E data strategy, the 20/hour rate-limit caveat on full suite runs, and a checklist for adding a spec.
- `docs/deployment-readiness.md` — pre-production checklist: required runtime services, production-only env concerns, database/email/cron readiness, and the decisions still open (hosting, domain, monitoring). Nothing is deployed; this tracks the gap.
- `docs/security.md` — the current security model: the two session systems, the guards and office-scoping helpers, session invalidation, the three rate-limit layers, audit logging, and a frank known-limitations section. Read it before touching auth, RBAC, or anything under `api/src/common/{guards,authz}/`.
- `public/assets/gis/porac_barangays.json`, `scripts/gis/raw/porac_srtm30m.tif` — raw geo source data consumed by the seed scripts in `api/scripts/seed/`. Not committed data-processing artifacts you should ever hand-edit; regenerate via the pipeline described below if the target municipality changes.
- `scripts/gis/` — a frontend-asset generator (`generate-porac-boundary.ts`, run via `pnpm gis:generate-boundary`) that reads/writes root `public/assets/gis/*`. Deliberately stays at root, not `api/scripts/`, since it has nothing to do with the database — it's Next.js public-asset tooling.

`lib/` is pure frontend code now — `api-client.ts`, `auth/` (session helpers), `gis/` (Leaflet styling), `municipality-config.ts` (env-driven, deliberately duplicated with `api/src/domain/municipality-config.ts`), `types/` (interface-only API response shapes, ported from the old `lib/admin/*`/`lib/citizens/*`), `utils/` (pure display/validation logic, including `utils/urgency.ts` and `utils/scoring.ts` — client-side duplicates of the triage math in `api/src/domain/urgency.ts`/`api/src/common/utils/scoring.ts`, used for badge/band display only, never for the authoritative score). Zero DB imports, zero `postgres`/`drizzle-orm` packages anywhere in `lib/`. A few of these frontend-owned files (`lib/municipality-config.ts`, `lib/utils/urgency.ts`, `lib/utils/scoring.ts`, `lib/utils/generate-exif-image.ts`) are also reached into by `api/scripts/` via relative path (`../../../lib/...`) since the one-time seed/migration scripts need the same pure logic and it isn't worth a second copy.

## Toolchain

Node and pnpm versions are pinned at root, not per-app: root `.nvmrc`/`package.json`'s `engines.node` declare the required Node major, and root `package.json`'s `packageManager` field declares the exact pnpm version (read via Corepack). `api/package.json` deliberately does not repeat or override either — the root declaration is the single source of truth for both apps. CI (`.github/workflows/ci.yml`) reads both from the same root files rather than hardcoding its own versions. Claude Code, Codex, and any other coding agent must use the repository-declared Node and pnpm versions (i.e. whatever `.nvmrc`/`packageManager` currently say) before running builds, tests, migrations, or seed scripts — don't assume the versions already active in your shell match.

## Commands (root, Next.js UI)

```
pnpm dev              # dev server (:3000)
pnpm build             # production build
pnpm lint               # eslint
```

## Commands (`api/`, NestJS backend)

```
pnpm --prefix api start:dev    # dev server (:3001), or cd api && pnpm start:dev
pnpm --prefix api build        # nest build
pnpm --prefix api test              # jest unit tests
pnpm --prefix api test:e2e      # jest e2e tests (NestJS-side, not Playwright — see below)
```

## Playwright E2E tests (root `e2e/`)

Full reference: `docs/testing.md` (test layers and commands, E2E data strategy, CI scope, known limitations, checklist for new specs). The essentials follow.

`pnpm exec playwright test -- --workers=1` drives the real Next.js dev server against the real dev database (no mocks, no isolated test DB) — the API (`pnpm --prefix api start:dev`) must already be running and migrated first. Playwright's `globalSetup` (`e2e/global-setup.ts`) idempotently provisions the demo admin/citizen accounts every spec logs in as before tests start, so you don't need to seed them by hand — see README.md §I for the full flow, why `--workers=1` is required (no per-test DB isolation), why ticket/report demo data (`pnpm --prefix api seed:diverse-reports`) stays a separate, explicit step rather than something global setup runs automatically (it's destructive — `TRUNCATE`s existing tickets), and why a full run can only be repeated once per hour (it posts ~16 real reports against `RateLimitService`'s 20/hour-per-IP backstop — prefer targeted spec runs, and never add a test-only bypass to a real anti-abuse control). All E2E credentials are centralized in `e2e/test-credentials.ts`; never hardcode a login in a new spec.

`build`/`start`/`start:dev`/`start:debug` all run `scripts/clean-build-cache.js` first (see that file for why) — tsc's incremental cache (`tsconfig.build.tsbuildinfo`) lives outside `dist/` and survives `nest-cli.json`'s `deleteOutDir`, so if `dist/` is ever deleted independently of a build, the next build used to trust the stale cache and silently skip re-emitting `dist/main.js`. This is now self-healing: every build/start command wipes both `dist/` and the buildinfo file first, so there is never a reason to manually delete either — if you ever see `Cannot find module .../dist/main`, just re-run the normal command. `pnpm --prefix api run verify:build-recovery` is the regression test for this.

Database setup order (one-time, run from **`api/`**, against `DATABASE_URL` in `api/.env`). Order matters — `migrate:geometry` FKs to `barangays(id)` and `migrate:config` reads `dem_points`, so both `import:barangays` and `seed:dem` must run before them, not after (verified empirically against a fresh DB: running them in the old documented order fails with `relation "barangays" does not exist` / `relation "dem_points" does not exist`):
```
pnpm --prefix api migrate                          # non-spatial Drizzle tables
pnpm --prefix api migrate:ratelimit
pnpm --prefix api migrate:ratelimit-citizen
pnpm --prefix api migrate:city-boundary
pnpm --prefix api import:city-boundary              # municipal outer boundary -> city_boundary_osm (idempotent; see docs/database.md)
pnpm --prefix api import:barangays                 # PSGC barangay polygons -> barangays (must precede migrate:geometry)
pnpm --prefix api migrate:geometry                 # geometry columns + GiST indexes, FKs to barangays(id)
pnpm --prefix api seed:dem                         # SRTM GeoTIFF -> dem_points (must precede migrate:config)
pnpm --prefix api migrate:config                    # config cache table, reads dem_points for elev_min/elev_max
pnpm --prefix api migrate:exif-data
pnpm --prefix api migrate:moderation
pnpm --prefix api migrate:resolution
pnpm --prefix api migrate:diverse-demo              # despite the name, adds core schema (ticket_status 'Rejected', tickets.flagged) — not demo-only
pnpm --prefix api migrate:citizen-identities
pnpm --prefix api migrate:citizen-account-security
pnpm --prefix api migrate:citizen-password-reset
pnpm --prefix api migrate:notifications
pnpm --prefix api migrate:admin-system-role
pnpm --prefix api migrate:admin-created-at
pnpm --prefix api migrate:admin-audit-events
pnpm --prefix api migrate:admin-password-security
pnpm --prefix api migrate:admin-status              # admins.is_active (account activation/deactivation)
pnpm --prefix api migrate:work-orders               # work_orders — FKs tickets(id) and admins(id), so it follows both
pnpm --prefix api migrate:ticket-disputes           # tickets.disputed_at/dispute_reason
pnpm --prefix api migrate:ticket-resolution-confirmation  # tickets.resolution_confirmed_at
pnpm --prefix api verify:config                     # print computed elev_min/elev_max etc.
pnpm --prefix api verify:city-boundary              # confirm city_boundary_osm is populated with valid geometry
pnpm --prefix api seed:admin -- <email> <password> <MEO|MDRRMO|-> <officer|supervisor|system_admin>  # use '-' for office with system_admin
pnpm --prefix api seed:diverse-reports              # idempotent demo tickets/citizens
```

These live in `api/scripts/{migrations,seed,verify}/` and run via `tsx --env-file=.env`, so env vars come from `api/.env` (direct, non-pooled Neon URL) — not the root `.env.local` (pooled URL) these scripts used before the move. `DATABASE_URL`, `CLOUDINARY_URL`, and `OPENWEATHERMAP_API_KEY` belong in `api/.env` **only** now — no root code or root script reads any of them (confirmed by repo-wide search), so do not tell a user to duplicate them into root `.env.local`. Root `.env.local` and `api/.env` share exactly one real secret: `JWT_SECRET` (see `api/.env.example`) — it must be byte-identical on both sides since both verify the same session cookies, but that is the only value the two files actually have in common.

## Database documentation

`docs/database.md` documents every table/view in `api/src/db/schema.ts` plus the raw-PG-only spatial tables and PostGIS system views (purpose, read/write paths, expected-empty state, ownership). Before changing schema — adding, removing, renaming, or significantly altering a table, view, enum, or important column — check `docs/database.md` first for existing context, and update it as part of the same change. Never remove a table just because it's empty in a development database (several are legitimately populated only by an optional seed/import step or are PostGIS-owned metadata that's expected to be empty for columns this app never declares as `geography`) — verify against `docs/database.md` and the table's actual read paths before treating emptiness as evidence of dead schema. Never manually delete `geometry_columns`/`geography_columns` (PostGIS-managed system catalog views, not application tables).

## Project status and roadmap

`docs/project-status.md` is the **only** project status and roadmap file — current phase (§1), shipped record (§2–§3), current queue (§4), deferred items (§5), and the standing do-not-build/risk constraints (§6–§7). It is the source of truth for what to build next (this file and `PLAN.md` explain *how* and *why* the existing system works, not what's queued). Check it before proposing or implementing a new feature, and update it in the same change when a feature, hardening task, deferred item, or do-not-build rule changes state (§8 carries the maintenance rule). Do not create a second roadmap, backlog, or "next steps" file — that split existed before and caused two documents to claim the same authority. Porac SDSS is a real operational system, not an MVP prototype — treat the roadmap's "next" items as production features, not a stopping point. Never add a sidebar item or dashboard quick action for a route or feature that does not exist yet — nav entries ship with their route, not ahead of it.

## This is a modified Next.js — verify before assuming standard APIs

`AGENTS.md` (root) warns that this Next.js build has breaking conventions vs. what training data assumes. One concrete example already found: middleware lives in `proxy.ts` (exporting `proxy()`), not `middleware.ts`/`export function middleware()`. Check `node_modules/next/dist/docs/` before relying on a remembered Next.js API or file-convention name.

## Architecture

**Two apps, one Postgres.** Root Next.js renders UI only — no `app/api/**` handlers, no direct DB queries from Server Components. `api/` (NestJS) owns every route, the database, auth, PostGIS, and the triage engine; Server Components call it via `lib/api-client.ts` (forwards the session cookie manually, `cache: "no-store"` since urgency/weather are live-recomputed per request), and the browser calls it through the `/api/*` rewrite in `next.config.ts` so cookies stay first-party. `proxy.ts` still runs on the Next side purely for the page-redirect UX (`/admin/*` → `/admin/login`, citizen pages → `/login`) — it duplicates nothing API-auth-related anymore, since NestJS's `AdminSessionGuard`/`CitizenSessionGuard` are the real gate.

**Two ORMs by column type, not by table** (inside `api/src/`). Drizzle (`api/src/db/schema.ts`) manages every non-geometry column. Any table or query touching a `geometry` column (`barangays.geom`, `dem_points.geom`, `tickets.geom`, `reports.geom`/`pin_geom`/`exif_geom`) goes through raw tagged-template SQL via the `PG` postgres.js client (`api/src/db/db.module.ts`) instead, because Drizzle's PostGIS support is too weak for `ST_*` functions. When adding a column, decide which client it belongs to based on whether it's geometry — don't add geometry handling to Drizzle. `api/scripts/db.ts` is the same split for the one-time migration/seed/verify scripts (a standalone `postgres`/drizzle client outside Nest's DI, since those scripts run via `tsx`, not the Nest process) — see Repo layout above.

**Report → Ticket separation.** `reports` (one per citizen submission) merge into `tickets` (the deduplicated unit admins act on) via `ST_DWithin` within a category-specific radius (`api/src/common/utils/radius.ts`) and a 7-day active window (`DUPLICATE_MERGE_WINDOW_DAYS`, `api/src/common/utils/duplicate-detection.ts` — anchored to the ticket's original `created_at`, does not slide on merge; see `PLAN.md` §6 for full boundary semantics). Merging increments `tickets.member_count` and recomputes the ticket centroid — this is why urgency scoring reads from `tickets`, not `reports`. The merge transaction uses a `pg_advisory_xact_lock` keyed on `(category, barangay_id)` rather than `SELECT ... FOR UPDATE`, because the latter hits a Postgres planner limitation when combined with `<->` KNN ordering (see `PLAN.md` §6).

**Urgency triage** (`api/src/domain/urgency.ts`, `api/src/domain/recompute.service.ts`): `urgency_score = (1/3 × elevationFactor) + (1/3 × precipitationFactor) + (1/3 × clusterFactor)`, banded Low/Medium/Critical at 0.4/0.7. Elevation is inverse-normalized against city-wide `elev_min`/`elev_max` (fixed constants computed once at DEM-seed time via `api/src/domain/app-config.service.ts`, never recomputed live). Precipitation is real `rain["1h"]` mm from OpenWeatherMap, capped at the PAGASA 30mm/h torrential threshold, cached ~10min in the `config` table (`api/src/domain/weather.service.ts`) — not in-memory, so it survives cold starts/restarts and is shared across routes. Recompute is triggered on-demand (admin dashboard/ticket-list/ticket-detail load, `GET /admin/tickets`/`/admin/tickets/geo`/`/admin/tickets/:id`/`/admin/dashboard`), plus two explicit manual triggers behind `CronSecretGuard`: `POST /cron/recompute-urgency` and `POST /cron/recompute-weather` (`api/src/cron/`) — NestJS being a long-lived process removed the Vercel-Hobby once-daily-cron constraint that originally motivated on-demand-only recompute, and both are now also called daily as a safety net by `.github/workflows/cron.yml` (Production Hardening), alongside the two cleanup-job cron routes and a third for `rate_limit_events`/`password_reset_rate_limit_events` (`api/src/domain/ratelimit.service.ts`'s `cleanupOldEvents`).

**Terminology: Severity vs. Urgency vs. Priority.** These three words are not interchangeable, and each maps to a specific, non-overlapping data source:
- **Severity** (`citizen_severity`) is the citizen's own subjective input on a report (Low/Medium/High/Critical) — never computed, validated by `SEVERITIES`/`reportSchema` in `api/src/contracts/schemas.ts`.
- **Urgency** (`urgency_score`, `urgency_band`) is the system-computed environmental hazard score from the Urgency triage formula above (elevation + rain + cluster density). `priority_score` and `urgency_level` are the *same* `urgency_score`, just rescaled 0–100 (`priorityScore = round(urgencyScore * 100)`) and re-banded LOW/MEDIUM/HIGH at 50/80 instead of Low/Medium/Critical at 0.4/0.7 — they are an urgency representation, not a separate concept, and are labeled "Urgency" in the UI (Dashboard, Ticket Queue, Ticket Detail) despite the `priority_score` column name. The `urgency_band` (0.4/0.7 thresholds) and `urgency_level` (50/80 thresholds, i.e. 0.5/0.8 on the 0–1 scale) can disagree at the boundary since the threshold sets don't match exactly — e.g. a ticket at `urgency_score = 0.45` is `urgency_band: 'Medium'` but `urgency_level: 'LOW'`. This is a known, currently unresolved discrepancy, not a bug introduced by any single change — reconciling the two threshold sets is a deliberate follow-up decision, not a copy fix.
- **Priority** (`priority_index`, from `api/src/common/utils/scoring.ts`) is a genuinely different formula — citizen severity + ticket age + barangay density — representing workflow/triage priority (how soon staff should act), not environmental hazard. It powers the Ticket Detail "Priority breakdown" card and the admin map's heatmap layer/intensity. It is unrelated to `urgency_score`/`priority_score` and must not be confused with them despite sharing the word "priority."
- **Dispute** (`tickets.disputed_at`/`dispute_reason`, set by `ReportsService.disputeReport`) is not a fourth scoring concept — it's a citizen resolution-feedback workflow signal layered on top of a `Resolved` ticket (citizen says "not actually fixed"), and never feeds into or reads from `urgency_score`/`priority_score`/`priority_index`/`urgency_band`, nor does it roll `status` back to an earlier value.

**Barangay resolution** (`api/src/domain/barangay.service.ts`) is a two-stage lookup: strict `ST_Contains` against `barangays` (PSGC/OCHA-sourced, ~130 avg vertices/polygon) first; if that misses, check `ST_Contains` against `city_boundary_osm` (an independent OSM outer-boundary import) — if inside, snap to the nearest barangay via `ST_Distance`/`<->` rather than rejecting, and flag the report `BOUNDARY_FALLBACK:<name>:<distanceM>`; if outside even that, reject as outside city limits. Barangay *identity* always comes from the PSGC table, never from OSM — OSM is only the outer accept/reject envelope. The old GADM-sourced table survives as `barangays_gadm_old` for rollback/reference (not queried by app code) — GADM was replaced because its ~7.6-avg-vertex polygons misregistered real addresses by up to 1.8km (`PLAN.md` §4.1 has the full validation writeup).

**Municipality is a config value, not a hardcoded assumption.** `MUNICIPALITY` (name, PSGC code, barangay count, city-center lat/lng, source data filenames) is read from env vars with Porac defaults — duplicated deliberately on both sides (`lib/municipality-config.ts` for the Next map components + `scripts/`, `api/src/domain/municipality-config.ts` for the API), since `TARGET_*` needs to be set identically in both `.env.local` and `api/.env`. Swapping the target LGU is an env-var change plus re-running the seed pipeline with new source files — not a code edit — but the source data (PSGC shapefile filter, SRTM clip, OSM boundary) still needs re-acquiring and empirically re-validated per city; nothing guarantees a new city's PSGC data is as clean as Angeles' turned out to be.

**Two auth systems, deliberately separate.** Admin sessions and citizen sessions (`api/src/auth/session.service.ts`) are independent JWTs (via `jose`), signed with an `aud` claim (`'admin'`/`'citizen'`) so a token from one cookie can never half-verify as the other. `AdminSessionGuard`/`CitizenSessionGuard` gate every API route; `proxy.ts` (root) keeps its own lightweight `verifySession`/`verifyCitizenSession` (`lib/auth/session.ts`/`citizenSession.ts`) purely for the page-redirect UX, sharing the same `JWT_SECRET`. There is no guest/anonymous reporting — citizen accounts are required (a deliberate deviation from the original plan, see `PLAN.md` §9/§16).

**Fraud/integrity flags** (EXIF mismatch, stale photo, no EXIF, perceptual-hash duplicate, boundary fallback) never block submission — they append to `reports.flags[]` and route to `/admin/flagged` for human review, matching the "decision support, not gatekeeper" framing in `PLAN.md`. Elevation is always server-computed from `dem_points` (nearest-neighbor `<->` query), never trusted from client input.

**Work orders are a fourth, independent status track.** `work_orders.status` (`api/src/admin/work-orders.service.ts`) tracks office task progress on the work needed to resolve a ticket — it is not `tickets.status`, has its own enum, and nothing couples the two: completing every work order on a ticket does not advance the ticket's status, and advancing the ticket's status does not touch its work orders. `notes` on a work order is internal-only and must never be added to any citizen-facing type or response.

**CSV/report exports reuse the list endpoint's own filter parsing, never a second copy of it.** `ReportsService` (`api/src/admin/reports.service.ts`) calls `TicketsService.parseTicketQuery`/`WorkOrdersService.parseQuery` directly rather than re-deriving office/status/category/etc. filters itself — this is what keeps `resolveOfficeScope` enforcement identical between `GET /admin/tickets` and `GET /admin/reports/tickets.csv` without a second authorization path to keep in sync. Export-only params (currently `dateFrom`/`dateTo`) are parsed separately in `ReportsService`, never mixed into the list endpoints' own query shape. CSV writing itself (`api/src/common/utils/csv.ts`) is a small hand-rolled RFC 4180 writer — no dependency for something this simple. Follow this same shape (delegate to the existing service's filter parser, add only the export-specific fields, hand-roll trivial formatting) before adding a new export type rather than inventing a parallel one.
