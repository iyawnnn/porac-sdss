# PORAC-SDSS API

The NestJS backend for PORAC-SDSS. It owns the database, auth, PostGIS spatial work, and the triage engine; the root Next.js app renders UI only and calls this service.

**Setup and environment variables live in the root [`README.md`](../README.md)** — §C for the two-env-file split (`api/.env` is separate from root `.env.local`), §D for the migration and seed order, which matters. Do not follow generic NestJS setup instructions for this app, and do not duplicate the setup guide here.

**Development commands and architecture notes live in [`CLAUDE.md`](../CLAUDE.md)** — the two-ORMs-by-column-type split, the report → ticket dedup flow, office scoping, and the full migration/seed command list.

Common commands (run from the repo root):

```bash
pnpm --prefix api start:dev   # dev server, :3001
pnpm --prefix api build       # nest build
pnpm --prefix api test        # jest unit tests
```

The Playwright E2E suite lives at the repo root, not here, and needs this API already running and migrated — see root README §I. `pnpm --prefix api test:e2e` is the separate NestJS-side jest e2e runner.
