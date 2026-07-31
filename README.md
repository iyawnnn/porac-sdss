# Porac SDSS (Spatial Decision Support System)

## A. PROJECT OVERVIEW

Project Name: Porac SDSS (Spatial Decision Support System)

Porac SDSS is a municipal infrastructure triage platform for Porac, Pampanga. It features spatial deduplication, DEM elevation risk scoring, OpenWeather telemetry, and automated photo EXIF GPS verification.

## B. PREREQUISITES

Install or prepare the following before running the project locally:

- Node.js v18 or higher
- A PostGIS-enabled PostgreSQL database, such as Neon PostgreSQL Cloud

## C. LOCAL ENVIRONMENT SETUP

### Step 1: Clone the repository and navigate into the app folder

```bash
git clone <repository-url>
```

### Step 2: Install dependencies

```bash
pnpm install
```

### Step 3: Configure Environment Variables

Create a `.env.local` file at the root of `porac-sdss-nextjs` and add your database and API credentials:

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

To test the report submission pipeline with real geotagged photo metadata, drag and drop any of the pre-configured JPEG files located in `public/uploads/reports/` (for example, `pothole_poblacion.jpg`) into the report form photo uploader.
