# Porac SDSS (Spatial Decision Support System)

## A. PROJECT OVERVIEW

Project Name: Porac SDSS (Spatial Decision Support System)

Porac SDSS is a municipal infrastructure triage platform for Porac, Pampanga. It features Operational Priority queue ordering (citizen severity, ticket age, barangay demand), office routing by category, and automated photo EXIF GPS and duplicate-image checks.

This README covers setup and running the system. For what it actually does, see [`docs/features.md`](docs/features.md); for a role-by-role walkthrough of how citizens and each admin type use it, see [`docs/user-flows.md`](docs/user-flows.md); for the Operational Priority model and its limitations, see [`docs/triage-model.md`](docs/triage-model.md); for the security model, see [`docs/security.md`](docs/security.md).

## B. PREREQUISITES

Install or prepare the following before running the project locally:

- Node.js 24.x (the exact major pinned in root [`.nvmrc`](.nvmrc) and `package.json`'s `engines.node` — this is the version CI and all coding agents must also use)
- pnpm 11.9.0 (pinned in root `package.json`'s `packageManager` field; enable Corepack rather than installing pnpm globally, see Step 2 below)
- A PostGIS-enabled PostgreSQL database, such as Neon PostgreSQL Cloud

## C. LOCAL ENVIRONMENT SETUP

### Step 1: Clone the repository and navigate into the app folder

```bash
git clone https://github.com/iyawnnn/porac-sdss.git
cd porac-sdss
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
pnpm install --frozen-lockfile
pnpm --prefix api install --frozen-lockfile
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
| `DATABASE_URL` | **Yes** | Neon's **direct/unpooled** endpoint, rather than a transaction-pooler endpoint; the root UI has no database connection — see the comment in `api/.env.example` for why |
| `JWT_SECRET` | **Yes** | Must match root's `.env.local` value exactly |
| `CLOUDINARY_URL` | **Yes** | Photo upload storage for report submissions |
| `OPENWEATHERMAP_API_KEY` | **Yes** | OpenWeatherMap Current Weather, for the per-ticket rainfall context on Ticket Detail (manuscript revision Phase 4, step 4c); never logged or stored. Reachability from the deployed backend still needs checking (`docs/deployment-readiness.md`) |
| `CRON_SECRET` | **Yes** | Bearer/`x-cron-secret` value `CronSecretGuard` checks on every `/cron/*` route — see [Scheduled Jobs](#j-scheduled-jobs--deployment) below |
| `HAZARD_INFORMATION_LOOKUPS` | No | `enabled` (default) or `disabled`. DENR-MGB Hazard Information lookups (manuscript revision Phase 4, step 4b); start the API with `disabled` for a Playwright run, which must never call the live service (`docs/testing.md`) |
| `RAINFALL_LOOKUPS` | No | `enabled` (default) or `disabled`. OpenWeatherMap rainfall context refreshes (manuscript revision Phase 4, step 4c); start the API with `disabled` for a Playwright run, which must never call the live service (`docs/testing.md`) |
| `PORT`, `NODE_ENV`, `RESET_TOKEN_TTL_MINUTES`, `TARGET_*` | No | Have working defaults |
| `WEB_ORIGIN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `OAUTH_STATE_SECRET` | No | Only needed to enable **Google OAuth login** — omit all of them to disable that login option entirely; no other feature depends on them |
| `EMAIL_FROM`, `RESEND_API_KEY` | No | Only needed for **real email delivery** (password reset, notifications) via Resend — omit both to fall back to `ConsoleEmailService`, which logs a masked confirmation instead of sending. This fallback is fine for local dev and is what tests run against; nothing requires real email delivery to pass. EMAIL_FROM alone is harmless; setting `RESEND_API_KEY` without `EMAIL_FROM` fails startup with a clear error naming both variables. A boot log line always states which provider is active. Locally, Resend will reject sending to any address other than your account owner's until a sending domain is verified — that's the provider declining, not a bug; see [`docs/deployment-readiness.md`](docs/deployment-readiness.md) §5. |

Full details and rationale for every variable, including ones not listed above, are in the comments inside [`.env.example`](.env.example) and [`api/.env.example`](api/.env.example) — read those files, not this table, before asking "does X matter."

## D. DATABASE MIGRATIONS & SEEDING

An existing database already at **0050** needs no migration reapplication for this documentation update or the 0031/0038 runner qualifications. Never replay historical SQL against a contracted database. Schema versions are not inferred from empty tables.

For a genuinely empty, owner-controlled disposable PostGIS database, follow the [fresh-database sequence](docs/database.md#fresh-database-sequence-owner-operated) and its reference-data prerequisites. `pnpm --prefix api migrate` runs only the five files in Drizzle's journal; it is **not** the complete 0000–0050 bootstrap. The full SQL chain is exercised by `test:fresh-database`; historical runners and their limits are mapped in [migration coverage](docs/migration-test-coverage.md).

Owner-operated seeds require a disposable target and final schema. [Demo data](docs/demo-data.md) documents accounts, real-service scenarios, empty-target refusal and optional additive bulk data. The shared guard rejects production even with its override flag. A reset copy of production is not an empty operational target, so the scenario demo must refuse it. Never clear audit history to make it fit.

Agents never run real migrations, seeds or archive commands. The sole standing seed/retirement exception is standard Playwright globalSetup/globalTeardown on an owner-reset, preflight-confirmed `phase2-test`. Production cleanup requires reviewed candidates, a backup and separate explicit owner approval; audit-referenced records must never be deleted.

## E. RUNNING THE APPLICATION

Run these in separate PowerShell terminals from the **repository root**, after the owner configures environment and schema:

```powershell
pnpm --prefix api start:dev
```

```powershell
pnpm dev
```

API normally listens on 3001; Next.js on 3000. Open http://localhost:3000. Use `pnpm.cmd` if execution policy blocks the PowerShell shim; do not change machine policy. Start Next from PowerShell. Never stop a verification-port process you did not start.

Deployment builds are `pnpm --prefix api build` and `pnpm build`; starts are `pnpm --prefix api start:prod` and `pnpm start`. Configure API origin, shared JWT secret and provider environment first. Review [deployment readiness](docs/deployment-readiness.md): build/CI success does not prove provider reachability, backups, hosting or production readiness. Final production checks are read-only and owner-performed.

## F. APPLICATION ROUTES

Common entry points for a local demo. For the full route list and what each surface does, see [`docs/features.md`](docs/features.md).

- Citizen Map: http://localhost:3000/map
- Report Form: http://localhost:3000/report
- My Reports: http://localhost:3000/dashboard
- Admin Login: http://localhost:3000/admin/login
- Admin Map: http://localhost:3000/admin/map
- Admin Ticket Queue: http://localhost:3000/admin/tickets

## G. DEMO ACCOUNTS & CREDENTIALS

The executable source is `e2e/test-credentials.ts`. Standard globalSetup provisions four staff identities (MEO, MDRRMO, MDRRMO Focal, System Admin) and five citizens. Specs import that source; never copy credentials into new tests or use demo credentials for real deployment. The owner-operated admin CLI takes account type, office and Focal flag; see [demo prerequisites](docs/demo-data.md).

## H. TESTING PHOTO EXIF GPS METADATA

Use the deterministic evidence cases in [demo data](docs/demo-data.md) and the in-memory evidence/demo tests. Generated `public/uploads/reports/` images are local artifacts, not a promised fresh-clone fixture set. Never manually submit test reports on production. Flags are review conditions, not automatic rejection or permission to merge.

## I. RUNNING END-TO-END (PLAYWRIGHT) TESTS

Follow [testing.md](docs/testing.md), including owner-reset preflight and console-mailer launch. The suite mutates the disposable copy with no per-test transaction isolation. It makes **15 real submissions** against **20/hour/IP**. Never run another full suite or demo in the same hour. Keep rate limits enabled.

Only after owner readiness, copy/schema/quota checks, fresh API build and authenticated warm-up:

```powershell
pnpm exec playwright test --workers=1 --max-failures=6
```

Standard setup/teardown provisions/retires fixtures; no manual seed or cleanup is needed. Teardown preserves audit and referenced assessments; it does not restore the reset baseline. Last full copy run at e17e18a: 307 passed with no skips/flakes/retries. This is dated evidence, not proof a future run passed.

Checks needing no real database:

```powershell
pnpm --prefix api test --runInBand
pnpm exec tsc --noEmit
node --import tsx --test lib/*.test.ts lib/utils/*.test.ts components/features/admin/shared/*.test.tsx
```

See testing.md for external pinned PGlite installation and the fresh-database, migration, permission, role and demo harnesses. CI runs both app builds and configured in-memory checks; it does not run Playwright.

## J. SCHEDULED JOBS & DEPLOYMENT

For the full pre-production checklist — required services, production-only env concerns, database and email readiness, pending security hardening, and the decisions still open — see [`docs/deployment-readiness.md`](docs/deployment-readiness.md).

### Scheduled cron jobs (GitHub Actions)

`api/src/cron/cron.controller.ts` exposes four routes behind `CronSecretGuard` (Operational Priority recalculation — `recompute-priority`, which replaced `recompute-urgency`/`recompute-weather` in manuscript revision Phase 1, step 7a — and three cleanup jobs — expired password-reset tokens, old read notifications, old rate-limit events). The former 7-day ticket escalation check (`POST /cron/check-ticket-escalations`) was removed in manuscript revision Phase 1, step 2. `.github/workflows/cron.yml` calls all four once a day via `curl`, authenticated the same way the guard already accepts (`Authorization: Bearer $CRON_SECRET`).

That workflow only works once two values are set under the repository's **Settings → Secrets and variables → Actions**:

| Name | Kind | Value |
|---|---|---|
| `CRON_SECRET` | Secret | Must be the exact same value as the deployed API's `CRON_SECRET` env var |
| `PORAC_API_BASE_URL` | Variable | The deployed API's public origin, e.g. `https://api.example.com` — **no trailing slash** |

**This scheduling only takes effect once the API is actually deployed and reachable at `PORAC_API_BASE_URL`.** Until then, the workflow runs on schedule but **skips calling any endpoint** — it checks for both required values first and exits green, naming whichever is missing, rather than attempting real requests that would fail with a connection error. That's expected, not a bug, and isn't something to "fix" locally. You can also trigger it manually (`workflow_dispatch`, the "Run workflow" button in the Actions tab) to confirm it reaches your deployed API once one exists.

### Deployment target

**Not yet decided.** Nothing in this repo commits to a hosting platform — there is no `Dockerfile`, no `vercel.json`, no `render.yaml`, nothing. `PLAN.md`'s references to Render are historical/prototype-era notes, not a current decision. What's known and fixed regardless of where this ends up hosted:

- Two separate deployables: the Next.js app (root) and the NestJS API (`api/`) — the API is a long-lived process (its own Postgres connection pool), not a serverless function, so whatever hosts it needs to support that.
- The API needs a public, stable origin reachable from wherever the Next.js app runs (`API_ORIGIN`/`INTERNAL_API_URL`) and from GitHub Actions (`PORAC_API_BASE_URL`, same origin).
- [current project status](docs/project-status.md) and [deployment readiness](docs/deployment-readiness.md) track the owner-reviewed deployment checks (credential rotation, backup verification, monitoring, a written runbook) — read those before treating "it runs locally" as "it's ready to deploy."

## Historical 0049/0050 cutover reference

Completed upgrade provenance, not instructions to reapply migrations to an existing final database. New empty targets follow Section D.

Phase 8b-1: `pnpm --prefix api migrate:contraction` applies 0049 after 0048, using one transaction, bounded locks and strict state verification. Take a Neon branch backup first. This code runs on both 0048 and 0049; deploy it and drain older consumers before contracting. No CSV export is required. `migrate:config` and `verify:config` are retired; `dem_points`, `seed:dem`, Terrain and TARGET_DEM_TIFF_FILE remain. Report acknowledgments remain at the 0049 stage and are removed separately by 0050; admins.role, dispute/feedback mirrors and permanent audit actor_role/admin_role remain. Do not replay historical SQL directly after contraction; the 0045/0048/0039 entry points verify the final state without recreating objects.

Fresh historical schema replay must include 0007_config.sql before the 0049 upgrade; retired config commands are not a provisioning path. The contraction intentionally aborts if the 0048 baseline is incomplete.


Phase 8b-2 / 0050: the app ignores `report_acknowledgments` before contraction and works after it is dropped. The physical ticket table remains `acknowledgments` (0038). Deploy the new build and drain older API/seed consumers BEFORE contraction; no old build may run after the drop. Focal counts remain per report (later reports inherit acknowledgment); median is per ticket, last 30 days, excluding negative/null intervals. Citizen response shape and privacy do not change. Grouping does not move acknowledgments.

Owner-operated cutover (not part of implementation verification):
1. Take a Neon backup branch. Deploy this build while the legacy table still exists and stop old writers.
2. Run `pnpm --prefix api archive:report-acknowledgments`. It uses a consistent read-only snapshot and writes private JSONL/manifest under `%LOCALAPPDATA%\PORAC-SDSS\phase8b-backups\<UTC timestamp>\`, outside the repo/web tree. Keep both files; do not publish names or remarks. Only path/count/SHA-256 are logged.
3. Run `pnpm --prefix api migrate:ack-contraction --archive "<absolute JSONL path>"`. One transaction, 5s lock/60s statement timeouts; advisory locks (8048,1), (8049,1), (8050,1). Schema/dependency/unmatched-ticket checks and live canonical count/SHA-256 must match the archive. It explicitly drops the report FK, then the legacy table with RESTRICT. Canonical acknowledgments, intake history, notifications, reports, tickets and audit protection are verified unchanged. Final-state rerun needs no archive; mixed states abort.
4. Smoke-check the build, then the separately approved single full Playwright run on a freshly reset disposable copy. Do not run historical SQL manually. The 0031/0038 entry points verify after contraction and never recreate/backfill the legacy table; assessment/staff/contraction entry points also recognize the later final state.

There is no destructive down migration. A transaction failure rolls back the drop; after commit, later legacy events/name snapshots/remarks cannot be reconstructed from the earliest ticket row. Retain the private archive and Neon backup for recovery. To roll back application code after contraction, restore the compatible schema/data first. PGlite does not prove production lock scheduling or Windows ACL behavior. DEM/Terrain, role/dispute mirrors, permanent actor_role/admin_role and append-only audit history stay.
