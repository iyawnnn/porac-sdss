# Porac SDSS (Spatial Decision Support System)

## A. PROJECT OVERVIEW

Project Name: Porac SDSS (Spatial Decision Support System)

Porac SDSS is a municipal infrastructure triage platform for Porac, Pampanga. It features spatial deduplication, DEM elevation risk scoring, OpenWeather telemetry, and automated photo EXIF GPS verification.

This README covers setup and running the system. For what it actually does, see [`docs/features.md`](docs/features.md); for a role-by-role walkthrough of how citizens and each admin type use it, see [`docs/user-flows.md`](docs/user-flows.md); for the urgency/priority scoring model and its limitations, see [`docs/triage-model.md`](docs/triage-model.md); for the security model, see [`docs/security.md`](docs/security.md).

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

This is a two-app repo, and **each app has its own env file** — there is no single `.env` that covers both:

- **Root (`porac-sdss/.env.local`)** — the Next.js UI. Copy [`.env.example`](.env.example) to `.env.local` and fill it in.
- **`api/.env`** — the NestJS API, which owns the database, auth, and every other backend concern. Copy [`api/.env.example`](api/.env.example) to `api/.env` and fill it in.

```bash
cp .env.example .env.local
cp api/.env.example api/.env
```

**`JWT_SECRET` is the only value the two files actually share** — it signs/verifies the two session cookies, and both apps need to agree on it (root's `proxy.ts` also verifies it locally, purely for page-redirect UX; the API is the real auth gate). `DATABASE_URL`, `CLOUDINARY_URL`, and `OPENWEATHERMAP_API_KEY` belong in `api/.env` only — no root code reads them, so don't copy them into `.env.local`.

Root `.env.local` — what's actually required:

| Variable | Required? | Purpose |
|---|---|---|
| `JWT_SECRET` | **Yes** | Must match `api/.env`'s `JWT_SECRET` exactly |
| `API_ORIGIN` | No (defaults to `http://127.0.0.1:3001`) | Server-to-server origin `next.config.ts` rewrites `/api/*` to |
| `INTERNAL_API_URL` | No (defaults to `http://127.0.0.1:3001`) | Origin Server Components fetch from directly (`lib/api-client.ts`) |
| `NEXT_PUBLIC_TARGET_*`, `TARGET_*` | No | Municipality config — Porac defaults are already correct; only change these to target a different LGU |

`api/.env` — what's actually required (validated at **boot**, in `api/src/config/env.ts` — a missing/malformed required var fails startup immediately, not the first request):

| Variable | Required? | Purpose |
|---|---|---|
| `DATABASE_URL` | **Yes** | Neon's **direct/unpooled** endpoint, not the `-pooler` one root uses — see the comment in `api/.env.example` for why |
| `JWT_SECRET` | **Yes** | Must match root's `.env.local` value exactly |
| `CLOUDINARY_URL` | **Yes** | Photo upload storage for report submissions |
| `OPENWEATHERMAP_API_KEY` | **Yes** | Live rainfall data feeding the urgency triage formula |
| `CRON_SECRET` | **Yes** | Bearer/`x-cron-secret` value `CronSecretGuard` checks on every `/cron/*` route — see [Scheduled Jobs](#j-scheduled-jobs--deployment) below |
| `PORT`, `NODE_ENV`, `RESET_TOKEN_TTL_MINUTES`, `TARGET_*` | No | Have working defaults |
| `WEB_ORIGIN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `OAUTH_STATE_SECRET` | No | Only needed to enable **Google OAuth login** — omit all of them to disable that login option entirely; no other feature depends on them |
| `EMAIL_FROM`, `RESEND_API_KEY` | No | Only needed for **real email delivery** (password reset, notifications) via Resend — omit both to fall back to `ConsoleEmailService`, which logs a masked confirmation instead of sending. This fallback is fine for local dev and is what tests run against; nothing requires real email delivery to pass. **Both or neither** — setting `RESEND_API_KEY` without `EMAIL_FROM` fails startup with a clear error naming both variables. A boot log line always states which provider is active. Locally, Resend will reject sending to any address other than your account owner's until a sending domain is verified — that's the provider declining, not a bug; see [`docs/deployment-readiness.md`](docs/deployment-readiness.md) §5. |

Full details and rationale for every variable, including ones not listed above, are in the comments inside [`.env.example`](.env.example) and [`api/.env.example`](api/.env.example) — read those files, not this table, before asking "does X matter."

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
pnpm --prefix api migrate:admin-system-role         # admins.role 'system_admin' + nullable office (RBAC)
pnpm --prefix api migrate:admin-created-at
pnpm --prefix api migrate:admin-audit-events        # admin_audit_events table (Admin Activity Log)
pnpm --prefix api migrate:admin-password-security   # admins.password_changed_at/session_valid_after
pnpm --prefix api migrate:admin-status              # admins.is_active (account activation/deactivation)
pnpm --prefix api migrate:admin-saved-views          # admin_saved_views — personal filter presets; FKs admins(id), so it follows
pnpm --prefix api migrate:saved-views-surface        # admin_saved_views.surface ('tickets' | 'flagged') — ALTERs the table above, so it follows it
pnpm --prefix api migrate:work-orders               # work_orders table — FKs tickets(id) and admins(id), so it must follow both
pnpm --prefix api migrate:ticket-disputes           # tickets.disputed_at/dispute_reason (citizen dispute loop)
pnpm --prefix api migrate:ticket-resolution-confirmation  # tickets.resolution_confirmed_at (persistent Confirm Fixed)
pnpm --prefix api migrate:admin-login-throttle      # admin_login_rate_limit_events (per-account failed-login throttling)
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

Common entry points for a local demo. For the full route list and what each surface does, see [`docs/features.md`](docs/features.md).

- Citizen Map: http://localhost:3000/map
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

This section covers running the E2E suite. For the full testing reference — every test layer and its command, the E2E data strategy, what CI does and doesn't run, known limitations, and a checklist for adding a spec — see [`docs/testing.md`](docs/testing.md).

The E2E suite (`e2e/*.spec.ts`) drives a real dev server against a real database — there is no mocked backend and no isolated test database, so a few things are required first:

1. `api/.env` must be configured and migrated (Section D) — the NestJS API must be able to start and reach Postgres.
2. Start the API separately (Playwright's `webServer` only boots the Next.js app, not the API): `pnpm --prefix api start:dev`
3. Run the suite from root:
   ```bash
   pnpm exec playwright test -- --workers=1
   ```

**Demo accounts are provisioned automatically.** Playwright's `globalSetup` (`e2e/global-setup.ts`) runs once before any test and idempotently upserts the three admin accounts (`meo@porac.gov.ph`, `mdrrmo@porac.gov.ph`, `sysadmin@porac.gov.ph` — via `pnpm --prefix api seed:e2e-admins`) and the citizen demo accounts (via the existing `pnpm --prefix api seed:users`), after first clearing throwaway `e2e-*@porac.gov.ph` admins left by earlier runs (`cleanup:e2e-admins`). Re-running the suite never duplicates accounts or errors on a second run — both scripts use `ON CONFLICT` upserts, not plain inserts. You never need to run these by hand; global setup does it for you as long as `api/.env` is reachable.

All test credentials live in one place — `e2e/test-credentials.ts` — imported by every spec that needs to log in. Never hardcode an email/password in a new spec; import `E2E_MEO_ADMIN`, `E2E_MDRRMO_ADMIN`, or `E2E_CITIZEN_ACCOUNT` instead.

**Demo tickets/reports are a separate, explicit step.** Global setup deliberately does *not* reseed tickets/reports automatically, because that seed script (`seed:diverse-reports`) is destructive — it runs `TRUNCATE reports, tickets` before reinserting a fixed demo set, which would silently wipe any tickets a developer is manually testing against. If a spec needs real ticket data and the database has none, that spec calls `test.skip()` with a message naming the command below — the skip comes from the spec itself (`admin-tickets`, `admin-work-orders`, `citizen-reports`), not from global setup, which does not inspect ticket data at all. Watch the run output for skips, not just failures, and run:
```bash
pnpm --prefix api seed:diverse-reports
```
This is idempotent in the sense that re-running it always produces the same deterministic set of demo tickets — but it is destructive to whatever tickets existed before, so it's opt-in rather than automatic.

**Why `--workers=1`:** the suite runs against one shared dev database with no per-test transaction isolation. Parallel workers would race on the same admin sessions, ticket rows, and moderation state (e.g. one worker resetting filters while another asserts on them), producing flaky failures unrelated to real bugs. Keep `--workers=1` until the suite gets real test-database isolation (e.g. a per-run schema or transactional rollback) — that is a bigger change than this fix and out of scope here.

**A full run submits real reports and can exhaust the IP rate limit.** Ticket-dependent specs create their own disposable tickets rather than mutating shared seeded ones, so a full suite run posts roughly 17 real reports through `POST /api/reports` (`admin-tickets` 7, `citizen-dispute` 6, `admin-work-orders` 2, `citizen-reports` 1, `citizen-map` 1). `RateLimitService` (`api/src/domain/ratelimit.service.ts`) backstops report submission at **20 per hour per IP** (`IP_HOURLY_BACKSTOP`), and every request in a local run originates from the same `127.0.0.1`. Signing up a fresh citizen per test — which the specs already do — resets the per-account limits (5/hour, 3-within-25m/24h) but **not** the IP one.

So one full run fits inside the budget; a second full run started within the same hour does not, and will fail partway through with `429` on report creation (surfacing as a failed `expect(res.ok())`, or as a whole spec file failing if it trips inside `admin-work-orders`' `beforeAll`). **This is the anti-abuse control working as designed, not a bug** — do not "fix" it by loosening the limit or adding a test-only bypass. Instead:

- Wait out the hour before the next full run, or
- Run only the specs you're working on, which is the recommended day-to-day loop:
  ```bash
  pnpm exec playwright test e2e/admin-tickets.spec.ts -- --workers=1
  pnpm exec playwright test -g "Case Closure Summary" -- --workers=1
  ```

**Current coverage.** Beyond the smoke/RBAC/dashboard specs, the admin ticket workflow is covered end to end in `e2e/admin-tickets.spec.ts`: Ticket Queue baseline and empty state, status/search/disputed/category/barangay filters and filter reset, office scoping (including a doctored `?office=` clamp check), queue → detail navigation, the Ticket Detail read-only surface, status advancement, office reassignment with restore, pagination and sorting, the mobile card list, and a full admin-UI resolution (notes + photo through the resolve dialog) whose result is then asserted from the citizen side via the Case Closure Summary card.

## J. SCHEDULED JOBS & DEPLOYMENT

For the full pre-production checklist — required services, production-only env concerns, database and email readiness, pending security hardening, and the decisions still open — see [`docs/deployment-readiness.md`](docs/deployment-readiness.md).

### Scheduled cron jobs (GitHub Actions)

`api/src/cron/cron.controller.ts` exposes six routes behind `CronSecretGuard` (urgency recompute, weather recompute, three cleanup jobs — expired password-reset tokens, old read notifications, old rate-limit events — and a ticket escalation check, `POST /cron/check-ticket-escalations`). `.github/workflows/cron.yml` calls all six once a day via `curl`, authenticated the same way the guard already accepts (`Authorization: Bearer $CRON_SECRET`).

That workflow only works once two values are set under the repository's **Settings → Secrets and variables → Actions**:

| Name | Kind | Value |
|---|---|---|
| `CRON_SECRET` | Secret | Must be the exact same value as the deployed API's `CRON_SECRET` env var |
| `PORAC_API_BASE_URL` | Variable | The deployed API's public origin, e.g. `https://api.example.com` — **no trailing slash** |

**This scheduling only takes effect once the API is actually deployed and reachable at `PORAC_API_BASE_URL`.** Until then, the workflow runs on schedule but **skips calling any endpoint** — it checks for both required values first and exits green, naming whichever is missing, rather than attempting real requests that would fail with a connection error. That's expected, not a bug, and isn't something to "fix" locally. You can also trigger it manually (`workflow_dispatch`, the "Run workflow" button in the Actions tab) to confirm it reaches your deployed API once one exists.

### Deployment target

**Not yet decided.** Nothing in this repo commits to a hosting platform — there is no `Dockerfile`, no `vercel.json`, no `render.yaml`, nothing. `PLAN.md`'s references to Render are historical/prototype-era notes, not a current decision. What's known and fixed regardless of where this ends up hosted:

- Two separate deployables: the Next.js app (root) and the NestJS API (`api/`) — the API is a long-lived process (its own Postgres connection pool, in-process weather/config caching), not a serverless function, so whatever hosts it needs to support that.
- The API needs a public, stable origin reachable from wherever the Next.js app runs (`API_ORIGIN`/`INTERNAL_API_URL`) and from GitHub Actions (`PORAC_API_BASE_URL`, same origin).
- [`docs/project-status.md`](docs/project-status.md) §4 and `PLAN.md` §0 track what else is still open before a real deployment (credential rotation, backup verification, monitoring, a written runbook) — read those before treating "it runs locally" as "it's ready to deploy."
