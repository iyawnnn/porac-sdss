# Fresh-database and seed CLI check

`pnpm --prefix api test:fresh-database` constructs disposable, in-memory PostgreSQL/PostGIS databases and runs every current seed/import/fixture-cleanup entrypoint as a real child process. It never loads an env file, reads a real database URL, starts the application servers or contacts Neon. Leave the owner's `api/.env` unchanged.

## Setup and run

Use Node/pnpm from the repository version files and install the API dependencies normally. Install these test-only packages in an external scratch directory, not in either application:

```powershell
$freshDeps = Join-Path $env:TEMP 'porac-fresh-pglite'
New-Item -ItemType Directory -Force $freshDeps | Out-Null
if (-not (Test-Path (Join-Path $freshDeps 'package.json'))) {
  '{"private":true}' | Set-Content (Join-Path $freshDeps 'package.json') -Encoding ascii
}
pnpm --dir $freshDeps add --save-exact @electric-sql/pglite@0.5.15 @electric-sql/pglite-socket@0.2.18 @electric-sql/pglite-postgis@0.2.15
$env:PGLITE_MODULE_ROOT = $freshDeps
pnpm --prefix api test:fresh-database
```

CI runs the same check after the API build/unit tests using a pinned scratch dependency install. It needs no database service, database secret or root application dependency install. Success prints the group count and an external temporary artifact directory containing sanitized child logs, boundary counters and `summary.json` with exact counts. The databases themselves are memory-only and are closed on success or failure. Temporary source/media/log artifacts remain for inspection.

## What runs

The command catalog is read from `api/package.json` and checked against every file in `api/scripts/seed`. All 14 command mappings (12 unique entrypoints) must execute. Children run the actual copied TypeScript entrypoint and its command arguments through the installed `tsx` loader. The package scripts' `--env-file=.env` option is deliberately omitted: each child gets a minimal environment and only its owning PGlite loopback URL. No replacement env file is created.

Sources and the two tracked polygon assets are copied to a temporary folder. Only API dependencies are linked read-only by policy; media and compiler caches stay in that temporary folder. A preload rejects env-file reads, writes outside the temporary tree and network connections other than its exact test port. `fetch` is refused. The compiler's optional watcher IPC probe is suppressed without connecting; it is counted separately. Every normal child must finish with zero blocked network/env/write attempts. A deliberate boundary probe must demonstrate all four refusals. The synthetic production-prefix refusal test uses an `.invalid` hostname and must fail before opening a socket.

No seed production guard, account validation, evidence rule, rate limiter, workflow service, notification or audit write is bypassed. Console email, local generated images and scripted hazard/rainfall results are the existing demo's external adapters. `PGMAX=1` serializes the CLI's PGlite transport only; it does not alter application limits.

## Real fresh-baseline order

The harness covers every historical migration SQL file, including duplicate-numbered early files; a new unlisted file fails coverage. It executes the checked-in SQL unchanged, with real PostGIS:

1. `0000_soft_landau.sql`, then the actual barangay importer (29 polygons).
2. Historical SQL through `0006_city_boundary_osm.sql`, then the actual DEM and city-boundary importers. A genuine 2-by-2 GeoTIFF has elevations 100, 110, 130 and one nodata cell: exactly three DEM points survive. The tracked city boundary produces one row.
3. The rest of the real SQL through 0050. Historical 0007 needs nonempty DEM data before calculating its NOT NULL bounds. For empty 0050 only, the harness supplies the real guard with count zero and the SHA-256 of zero bytes inside its transaction. No archive file or archive/migration runner is invoked.
4. The real canonical admin, E2E admin and citizen commands. The foundation contains five admins (one manually provisioned System Administrator plus four demo staff), five citizens, no reports/tickets/Work Orders/assessments and no audit history.

This is an offline verification procedure, not authorization to bootstrap a shared database. The generic Drizzle journal contains only the early generated entries; it does not represent the full historical chain or its spatial prerequisites. Do not treat `migrate` alone as a complete fresh-install procedure. Owner-operated real database work still requires its separate reviewed procedure and backups.

## Assertions and isolation

- Barangay, city-boundary, DEM and account commands rerun without duplicate identities/reference rows; invalid legacy admin arguments leave accounts unchanged.
- The presentation, diverse, mock and `db:seed` aliases each get their own clone of the empty in-memory foundation. Each produces 15 reports/tickets/acknowledgments, four Work Orders, four assessments, two feedback answers and 15 real submission-rate events. A repeat refuses without changing operational/audit state.
- Bulk gets a separate fresh database (three reports), plus explicit append checks on the presentation database. Six more submissions are refused when only five IP slots remain; three succeed. Implicit and repeated batches refuse without changes. No rate events are deleted or aged artificially.
- E2E fixture creation, cleanup, repeated cleanup and reseeding run through their actual CLIs. Cleanup retires active fixtures; assessment-referenced test admins are deactivated and retained, while a truly unreferenced test account can be removed. Existing audit rows remain unchanged.
- The final catalog preserves physical `acknowledgments`, `report_intake_actions`, `dem_points`, `tickets.priority_index`, permanent `actor_role`/`admin_role`, the assessor RESTRICT FK and append-only audit trigger/function. Retired acknowledgment/config/compatibility objects and columns remain absent.
- Invalid assessor deletion, missing assessor, duplicate ticket assessment, invalid JSONB shape and audit UPDATE/DELETE fail through real constraints. Actual seed/workflow/audit paths receive `drizzle(postgresClient)` on this same real baseline; the independent observer uses its own postgres.js client, whose raw SQL parameters reject JS Date objects.

The detailed 15-submission scenario assertions remain in `test:demo-workflow` and [demo-data.md](demo-data.md); this check adds fresh-schema and actual CLI coverage. It does not replace browser testing on an owner-reset copy. The demo and a full Playwright run must not share the same hour on a real disposable target because both consume the 20/hour/IP submission limit.
