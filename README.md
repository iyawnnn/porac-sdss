# Porac SDSS (Spatial Decision Support System)

## A. PROJECT OVERVIEW

Project Name: Porac SDSS (Spatial Decision Support System)

Porac SDSS is a municipal infrastructure triage platform for Porac, Pampanga. It features spatial deduplication, DEM elevation risk scoring, OpenWeather telemetry, and automated photo EXIF GPS verification.

## B. PREREQUISITES

Install or prepare the following before running the project locally:

- Node.js 24.x (the exact major pinned in root [`.nvmrc`](.nvmrc) and `package.json`'s `engines.node` — this is the version CI and all coding agents must also use)
- pnpm 11.9.0 (pinned in root `package.json`'s `packageManager` field; enable Corepack rather than installing pnpm globally, see Step 2 below)
- A PostGIS-enabled PostgreSQL database, such as Neon PostgreSQL Cloud

## C. LOCAL ENVIRONMENT SETUP

### Step 1: Clone the repository and navigate into the app folder

```bash
git clone <repository-url>
```

### Step 2: Set up the toolchain (Node + pnpm)

The repository pins its own Node and pnpm versions — don't rely on whatever happens to already be on your machine.

**macOS/Linux:**

```bash
nvm install    # reads .nvmrc, installs/uses Node 24.x
corepack enable
corepack prepare pnpm@11.9.0 --activate
node --version   # expect v24.x
pnpm --version    # expect 11.9.0
```

**Windows (PowerShell):**

```powershell
nvm install (Get-Content .nvmrc)
nvm use (Get-Content .nvmrc)
corepack enable
corepack prepare pnpm@11.9.0 --activate
node --version   # expect v24.x
pnpm --version    # expect 11.9.0
```

(Any Node version manager that reads `.nvmrc` works — `nvm`, `fnm`, `nvm-windows`, Volta, etc.)

### Step 3: Install dependencies

This is a two-app repo — the root Next.js app and `api/` (NestJS) each have their own `package.json` and lockfile, so both need installing:

```bash
pnpm install
pnpm --prefix api install
```

### Step 4: Configure Environment Variables

Create a `.env.local` file at the root of `porac-sdss` and add your database and API credentials:

```env
DATABASE_URL="postgresql://user:password@ep-example.neon.tech/porac_sdss?sslmode=require"
OPENWEATHER_API_KEY="your_openweather_api_key"
NEXTAUTH_SECRET="your_nextauth_secret"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

## D. DATABASE MIGRATIONS & SEEDING

Apply PostGIS schema migrations and seed municipal boundaries, demo accounts, and realistic hazard tickets. **Order matters** — several later steps depend on tables/columns an earlier step creates (e.g. `import:barangays` must run before `migrate:geometry`, and `seed:dem` before `migrate:config`), and running them out of order fails with errors like `relation "barangays" does not exist`. See [`docs/database.md`](docs/database.md) for what each table is for, who reads/writes it, and whether an empty table is expected or a sign something's missing:

```bash
pnpm --prefix api migrate                          # non-spatial Drizzle tables
pnpm --prefix api migrate:ratelimit
pnpm --prefix api migrate:ratelimit-citizen
pnpm --prefix api migrate:city-boundary
pnpm --prefix api import:city-boundary              # municipal outer boundary -> city_boundary_osm (idempotent)
pnpm --prefix api import:barangays                 # PSGC barangay polygons -> barangays (must precede migrate:geometry)
pnpm --prefix api migrate:geometry                 # geometry columns + GiST indexes, FKs to barangays(id)
pnpm --prefix api seed:dem                         # SRTM GeoTIFF -> dem_points (must precede migrate:config)
pnpm --prefix api migrate:config                   # config cache table, reads dem_points for elev_min/elev_max
pnpm --prefix api migrate:exif-data
pnpm --prefix api migrate:moderation
pnpm --prefix api migrate:resolution
pnpm --prefix api migrate:diverse-demo              # despite the name, adds core schema (ticket_status 'Rejected', tickets.flagged) — not demo-only
pnpm --prefix api migrate:citizen-identities
pnpm --prefix api migrate:citizen-account-security
pnpm --prefix api migrate:citizen-password-reset
pnpm --prefix api migrate:notifications
pnpm --prefix api seed:users                        # citizen demo accounts (Section G) — idempotent, safe to rerun
pnpm --prefix api seed:admin -- meo@porac.gov.ph PoracDemo2026! MEO supervisor      # admin demo account (Section G)
pnpm --prefix api seed:admin -- mdrrmo@porac.gov.ph PoracDemo2026! MDRRMO supervisor # second admin demo account
pnpm --prefix api seed:diverse-reports              # demo tickets/reports — idempotent (truncates and reseeds a fixed set)
pnpm gis:generate-boundary                          # frontend map boundary overlay — independent of the DB steps above, run any time
```

All seed commands above are idempotent (upsert by unique email, or truncate-and-reseed for `seed:diverse-reports`) — safe to rerun any of them right before a live demo without erroring or duplicating data.

## E. RUNNING THE APPLICATION

Start the local development server:

```bash
pnpm dev
```

Open http://localhost:3000 in your browser.

## F. APPLICATION ROUTES

- Public Map: http://localhost:3000/map
- Report Form: http://localhost:3000/report
- My Reports: http://localhost:3000/reports
- Admin Login: http://localhost:3000/admin/login
- Admin Map: http://localhost:3000/admin/map
- Admin Ticket Queue: http://localhost:3000/admin/tickets

## G. DEMO ACCOUNTS & CREDENTIALS

All accounts use the default password: `PoracDemo2026!`

Citizen Accounts:

- `citizen@porac.ph`
- `citizen1@porac.ph`
- `citizen2@porac.ph`
- `citizen3@porac.ph`
- `citizen4@porac.ph`
- `citizen5@porac.ph`

Admin Accounts:

- Municipal Engineering Office (MEO): `meo@porac.gov.ph`
- MDRRMO: `mdrrmo@porac.gov.ph`

These two admin accounts are also the accounts the Playwright E2E suite logs in as — see Section I, they are provisioned automatically, you do not need to run `seed:admin` for them manually.

## H. TESTING PHOTO EXIF GPS METADATA

To test the report submission pipeline with real geotagged photo metadata, drag and drop any of the pre-configured JPEG files located in `public/uploads/reports/` (for example, `01_poblacion.jpg`) into the report form photo uploader.

## I. RUNNING END-TO-END (PLAYWRIGHT) TESTS

The E2E suite (`e2e/*.spec.ts`) drives a real dev server against a real database — there is no mocked backend and no isolated test database, so a few things are required first:

1. `api/.env` must be configured and migrated (Section D) — the NestJS API must be able to start and reach Postgres.
2. Start the API separately (Playwright's `webServer` only boots the Next.js app, not the API): `pnpm --prefix api start:dev`
3. Run the suite from root:
   ```bash
   pnpm exec playwright test -- --workers=1
   ```

**Demo accounts are provisioned automatically.** Playwright's `globalSetup` (`e2e/global-setup.ts`) runs once before any test and idempotently upserts the two admin accounts (`meo@porac.gov.ph`, `mdrrmo@porac.gov.ph` — via `pnpm --prefix api seed:e2e-admins`) and the citizen demo accounts (via the existing `pnpm --prefix api seed:users`). Re-running the suite never duplicates accounts or errors on a second run — both scripts use `ON CONFLICT` upserts, not plain inserts. You never need to run these by hand; global setup does it for you as long as `api/.env` is reachable.

All test credentials live in one place — `e2e/test-credentials.ts` — imported by every spec that needs to log in. Never hardcode an email/password in a new spec; import `E2E_MEO_ADMIN`, `E2E_MDRRMO_ADMIN`, or `E2E_CITIZEN_ACCOUNT` instead.

**Demo tickets/reports are a separate, explicit step.** Global setup deliberately does *not* reseed tickets/reports automatically, because that seed script (`seed:diverse-reports`) is destructive — it runs `TRUNCATE reports, tickets` before reinserting a fixed demo set, which would silently wipe any tickets a developer is manually testing against. If a spec needs real ticket data (e.g. `admin-flagged`, `admin-dashboard`, the map smoke test) and the database has none, global setup prints a warning telling you to run:
```bash
pnpm --prefix api seed:diverse-reports
```
This is idempotent in the sense that re-running it always produces the same deterministic set of demo tickets — but it is destructive to whatever tickets existed before, so it's opt-in rather than automatic.

**Why `--workers=1`:** the suite runs against one shared dev database with no per-test transaction isolation. Parallel workers would race on the same admin sessions, ticket rows, and moderation state (e.g. one worker resetting filters while another asserts on them), producing flaky failures unrelated to real bugs. Keep `--workers=1` until the suite gets real test-database isolation (e.g. a per-run schema or transactional rollback) — that is a bigger change than this fix and out of scope here.
