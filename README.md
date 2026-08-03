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

Apply PostGIS schema migrations and seed municipal boundaries, demo users, and realistic hazard tickets:

```bash
pnpm --prefix api migrate
pnpm --prefix api seed:users
pnpm gis:generate-boundary
pnpm --prefix api seed:diverse-reports
```

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

## H. TESTING PHOTO EXIF GPS METADATA

To test the report submission pipeline with real geotagged photo metadata, drag and drop any of the pre-configured JPEG files located in `public/uploads/reports/` (for example, `01_poblacion.jpg`) into the report form photo uploader.
