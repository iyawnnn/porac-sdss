ac-core-nextjs/
├─ app/
│  ├─ (citizen)/            → report, dashboard, my-reports, tracker
│  ├─ (admin)/              → login, live-map, hazard-list, analytics
│  └─ api/
│     ├─ reports/           → Route Handlers (POST create, GET list)
│     ├─ tickets/           → merge logic, urgency recompute
│     ├─ geospatial/        → barangay containment lookup
│     ├─ auth/
│     └─ cron/weather/      → hit by Vercel Cron every 10 min
├─ lib/
│  ├─ db.ts                 → postgres.js client (Neon)
│  ├─ geo/                  → ST_DWithin, ST_Contains queries as raw SQL
│  ├─ triage/               → urgency formula, normalization
│  └─ validation/           → Zod schemas (port directly, framework-agnostic)
├─ scripts/
│  ├─ seed-barangays.ts     → GeoJSON → Postgres
│  └─ seed-dem.ts           → GeoTIFF → dem_points table
├─ drizzle/ or migrations/  → schema + migrations
└─ vercel.json              → cron config