# Spike: per-run test database isolation

**Status: design document, no implementation.** Written for [GitHub issue #68](https://github.com/iyawnnn/porac-sdss/issues/68). Cross-referenced from [`testing.md`](testing.md) §9.

## 1. Why this exists

`testing.md` §4 and §8 already document the consequences of the Playwright suite running against one shared development database with no per-test isolation: `--workers=1` is mandatory, test data accumulates (`cleanup:e2e-admins` exists solely to bound one symptom of this), the suite cannot run in CI, and a full run posts real reports against a 20/hour-per-IP limit so it can't repeat within the hour. Database isolation is the single change that would address most of that at once — it is also the largest item in the testing backlog, which is why nobody has scoped it. This document does that scoping: it compares four isolation approaches and measures the one number that most affects the comparison — how long the reference-data seed pipeline actually takes.

## 2. Constraints that make this non-trivial

- **PostGIS.** Every geometry column (`barangays.geom`, `dem_points.geom`, `tickets.geom`, `city_boundary_osm.geom`) needs the PostGIS extension available in whatever database instance a run targets — not just "a Postgres."
- **Seeded reference data, in a load-bearing order.** README.md §D and CLAUDE.md's Commands section state the order explicitly: `import:barangays` and `seed:dem` must both run before `migrate:geometry` and `migrate:config` respectively — those later steps FK to `barangays(id)` / read from `dem_points`, and fail against a fresh DB in the wrong order ("relation does not exist"). Any isolation approach that stands up a new database/schema per run has to replay this exact order, not just "run migrations."
- **The API is a separate, long-lived process with its own connection pool.** `api/src/db/db.module.ts` opens a `postgres.js` pool (`max: 10`) once, at NestJS bootstrap, from a single `ConfigService.get('DATABASE_URL')` read — not per-request. That pool is fixed for the process's lifetime. There is no code path today that repoints it at a different database or schema after startup. Any per-run isolation scheme that wants the API to see run-specific data has to either restart the API process with a different `DATABASE_URL`/`search_path` per run, or use a mechanism that doesn't require repointing the pool at all (e.g. a `search_path` set at the OS/DNS level, or accepting that the API keeps talking to the same physical database while only the tables inside vary).
- **`seed:diverse-reports` is destructive by design.** `TRUNCATE reports, tickets RESTART IDENTITY CASCADE`, confirmed in `api/scripts/seed/seed-diverse-reports.ts`. `testing.md` §3 already documents why this is a deliberate, explicit, non-automatic step — any isolation design has to decide whether per-run test data replaces this entirely or coexists with it.

## 3. Measured baseline

**Measured, not guessed**, against the live local dev database (`api/.env`, Neon Postgres) with the API already running. Only the reference-data scripts that are genuinely safe to rerun on this shared DB were run — see "What was skipped" below.

| Command | What it does | Wall time |
|---|---|---|
| `pnpm --prefix api import:barangays` | Update-by-name 29 barangay polygons (idempotent, never truncates — `tickets.barangay_id` FKs to it) | 5.9s |
| `pnpm --prefix api seed:dem` | `TRUNCATE dem_points` + bulk-reinsert from the SRTM GeoTIFF | 27.0s |
| `pnpm --prefix api import:city-boundary` | `TRUNCATE city_boundary_osm` + reinsert the dissolved-boundary polygon | 2.1s |
| `pnpm --prefix api migrate:config` | Recompute `elev_min`/`elev_max` cache from `dem_points` | 1.8s |
| **Total** | | **~37s** |

`seed:dem` printed `Inserted 323253 dem_points.` — the DEM reseed is the dominant cost by a wide margin (73% of the measured total), because it does a full bulk insert of every non-nodata raster cell inside the municipal boundary.

**What was skipped, and why:**
- **`seed:diverse-reports`** — not run. It `TRUNCATE`s `reports` and `tickets` on the live shared dev database; running it to get a timing number would have destroyed whatever a developer is currently testing against, which is exactly what `testing.md` §3 says never to do casually. Its own script structure (10 fixed report specs, real Cloudinary-free EXIF generation, one deterministic recompute pass) suggests low-single-digit seconds, but that is a guess, not a measurement, and is called out as such here rather than stated as fact.
- **Structural DDL migrations** (`migrate:geometry`, `migrate:city-boundary`, `migrate:admin-*`, etc.) — not (re-)run. They are one-time `ALTER TABLE`/`CREATE TABLE` scripts already applied to this dev database; rerunning them either no-ops loudly (as seen above — every reference-data script printed a PostgreSQL `NOTICE` for its own `CREATE TABLE IF NOT EXISTS`/`CREATE INDEX IF NOT EXISTS`, at effectively zero cost) or is not meaningful to time without a genuinely fresh, unmigrated database, which does not exist to test against here. A from-scratch DB provision would need to run all ~23 migration scripts in README §D's order; that full-provision number is unmeasured and is the real "setup cost" line for schema-per-run and database-per-run below — it should be measured for real (e.g. against a throwaway Neon branch) before committing to either approach, not estimated from this spike.

**Takeaway:** ~37s for the reference-data portion alone, dominated by the DEM point reseed. This is the number any "per-run" isolation approach has to pay **every run** unless it reuses a template/snapshot instead of reseeding from source files each time — which immediately rules out naive re-seeding as a per-test-run strategy and pushes the comparison toward template-based approaches.

## 4. Approaches compared

| | Schema-per-run | Database-per-run (template clone) | Transaction rollback per test | Ephemeral PostGIS container (CI) |
|---|---|---|---|---|
| **Setup cost** | Moderate — one-time template schema build, then `CREATE SCHEMA`/`search_path` per run | Moderate — one-time template DB with `CREATE DATABASE ... TEMPLATE ...` | Low code, but blocked by the connection-pool problem (see below) | Moderate-high — container image with PostGIS + reference data baked in or restored on start |
| **Run-time impact** | Fast if templated (schema clone is a metadata operation, not a data copy) — reference-data reseed avoided entirely | Fast — `CREATE DATABASE ... TEMPLATE` is a filesystem-level copy in Postgres, not row-by-row; avoids the ~37s reseed | Would be near-zero per test if it worked, but see below | Full ~37s+ reseed unless the container image/volume already has reference data baked in, in which case it's just container startup time |
| **What it breaks / complicates** | `search_path` must be set correctly on every connection the API opens — the API's single pool (`max: 10`) would need every connection in the pool pinned to the run's schema, which `postgres.js`'s default pooling doesn't guarantee per-request | Requires Postgres superuser/owner privileges to `CREATE DATABASE FROM TEMPLATE`, and the API's `DATABASE_URL` must point at the new DB name — needs an API restart per run (see §2) | The API is a **separate process** from the test runner with its own pool — a rollback started in a Playwright-driven `BEGIN` has no way to also be the transaction the API's own connections write through. The issue's own proposal table already flags this as "hard here," and this spike confirms it: without routing 100% of API writes through one shared connection (which the API's `postgres.js` pool of 10 doesn't do), this approach doesn't work for this architecture without a substantial API-side change (e.g. a request-scoped transaction middleware) | Nothing existing breaks — it's additive, isolated to CI. Managed Neon (used today) isn't a local Docker container, so this is a genuinely new piece of infrastructure, not a repointing of the existing DB |
| **Works locally?** | Possible, but every isolated run needs its own API process pointed at its schema — awkward against the current workflow where `playwright.config.ts`'s `reuseExistingServer: !process.env.CI` deliberately attaches to a developer's already-running `pnpm --prefix api start:dev` | Same API-restart-per-run problem as schema-per-run — same awkwardness locally | No — blocked by the connection-pool problem regardless of local/CI | Not the target use case — this is a CI-only approach by design |
| **Works in CI?** | Yes, if the API is started fresh per CI run (already true — CI has no long-running API today) with `DATABASE_URL`/`search_path` set before that start | Yes, same reasoning — CI starts the API fresh, so pointing it at a freshly cloned DB per run is natural | No — the architectural blocker applies in CI too | Yes — this is what it's for |
| **Reference-data handling** | Build the template schema once (run the full seed pipeline once, ~37s + full migration set), then every run clones structure without re-seeding | Same — build the template DB once, `CREATE DATABASE ... TEMPLATE` clones data files directly, no reseed per run | N/A — moot, approach doesn't work here | Bake reference data into the container image or a mounted volume snapshot at build time, so container start doesn't pay the ~37s cost either |
| **API connection-pool compatibility** | Needs per-connection `search_path`, which `postgres.js`'s pool doesn't guarantee without extra plumbing (e.g. `SET search_path` on every checkout) — non-trivial | Cleanest fit: a real separate database, the API's existing single-`DATABASE_URL`-per-process model already matches this exactly — just needs a restart per run | Fundamentally incompatible with a separate long-lived API process without new request-scoped transaction plumbing in the API itself | N/A locally; in CI the API starts fresh per run already, so this is the same "restart with new `DATABASE_URL`" story as database-per-run |

## 5. Middle path: CI-only isolation, shared dev DB locally

The issue explicitly asks this be considered, and the comparison above supports it: **local** development already restarts the API rarely (developers run `pnpm --prefix api start:dev` once and keep it up for a session), so schema-per-run or database-per-run's "restart the API with a new `DATABASE_URL` per run" requirement fights the existing local workflow for no local benefit — the shared dev DB's downsides (`--workers=1`, data accumulation) are annoying but tolerated today, and `testing.md` §8 already documents them as known, accepted limitations. **CI** has no long-running API today (Playwright doesn't even run in CI yet), so CI would start the API fresh regardless — paying one API-restart-with-new-`DATABASE_URL` per CI run costs nothing extra there. This asymmetry is the strongest argument for scoping isolation to CI only, at least initially, rather than solving both environments at once.

## 6. Recommendation

**Database-per-run (template clone), CI-only, is the right target — but not worth building yet.**

Reasoning:
- Of the four, only database-per-run and schema-per-run avoid paying the ~37s reference-data cost on every run (via templating), and only database-per-run cleanly matches the API's existing one-`DATABASE_URL`-per-process model without new per-connection `search_path` plumbing.
- Transaction-rollback-per-test is ruled out outright for this architecture — the API's separate connection pool makes it a much larger change (request-scoped transaction middleware in the API itself) than the issue's own sketch implies, not a testing-side change at all.
- Ephemeral PostGIS-in-container is really a packaging choice for *where* the template database lives in CI, not a fifth independent approach — it's compatible with, not competing against, database-per-run.
- The CI-only middle path (§5) means this is genuinely two separate pieces of work: (a) build and validate a Neon (or containerized) template database with the full ~23-migration + reference-data pipeline baked in, and (b) wire a CI workflow that clones it per run and points a freshly-started API at the clone. Neither is started here.

**Rough effort sizing:** Medium — likely 2-4 focused days: half a day to a day validating `CREATE DATABASE ... TEMPLATE` (or a Neon branch-per-run, if using Neon's own branching feature, which does something functionally similar and may be simpler than hand-rolling `TEMPLATE`) actually reproduces PostGIS + all reference data correctly; a day or two wiring the CI workflow and API startup sequencing; a day of buffer for the inevitable order-of-operations surprises the load-bearing migration sequence (§2) tends to produce. This is squarely a "worth scoping further, not worth starting today" result — it unblocks issue #019 (Playwright in CI) but has no dependents blocking on it right now, and `testing.md` §8's local-workflow pain (the actual day-to-day annoyance) isn't what this fixes, since the recommendation is explicitly CI-only.

**"Not worth it yet" is the practical read for right now**, revisited once Playwright-in-CI (#019) is actually prioritized — building the template database is only valuable in service of that, not on its own.

## 7. What this would unlock, and what it would not

**Would unlock (CI-only scope):**
- Playwright running in CI at all (currently blocked entirely — no database, no API).
- Repeated CI runs without the local dev DB's data-accumulation concerns (`cleanup:e2e-admins`-style workarounds become unnecessary in CI specifically, since each run gets a disposable clone).

**Would not unlock, even with CI isolation shipped:**
- **`--workers=1` locally.** The middle path (§5) explicitly keeps local runs on the shared dev DB, so the local parallelization blocker in `testing.md` §4 is untouched. Removing `--workers=1` locally would require the full local-isolation story this document recommends against building yet.
- **The report rate-limit ceiling.** `testing.md` §6's 20-reports/hour-per-IP cap is a `RateLimitService` control on the API, completely independent of which database backs a test run. A CI database clone does not change how many real reports a CI run posts against that limit — CI would need its own IP-based accounting (it likely gets one for free, running from a different network than any local developer) but this document makes no claim about that; it is out of scope here and remains a live constraint for whatever CI workflow is eventually built.
- **Transaction-rollback-style fast per-test isolation**, locally or in CI — ruled out architecturally per §4, not merely deprioritized.
