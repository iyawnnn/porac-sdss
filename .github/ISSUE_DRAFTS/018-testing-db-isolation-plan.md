# Plan per-run test database isolation

**Labels:** `testing`, `priority:p3`, `spike`
**Type:** Spike / design document — **no implementation in this issue**
**Priority:** P3

## Background

`docs/testing.md` §4, §8, §9. The Playwright suite runs against **one shared development database** with no per-test transaction isolation and no schema-per-worker. Consequences, all documented:

- `--workers=1` is mandatory — parallel workers would race on sessions, ticket rows, filter state, and moderation state.
- Test data persists: tickets, reports, work orders, and citizen accounts accumulate.
- `cleanup:e2e-admins` exists solely because throwaway admins otherwise pile up until `/admin/admins` blows past test timeouts.
- Playwright cannot run in CI, because CI has no database and no API.
- The suite is slow, and cannot be re-run twice within an hour (report rate limit).

**Database isolation is the single change that would address most of that at once.** It is also by far the largest item in the testing backlog, which is why the suite still runs serially.

## Problem

Nobody has scoped what isolation would actually take for this app. It is not obviously simple:

- The schema depends on **PostGIS**, plus seeded reference data (barangay polygons, DEM points, city boundary) that takes real time to load.
- Setup order is load-bearing (`import:barangays` before `migrate:geometry`; `seed:dem` before `migrate:config`).
- The API is a **separate long-lived process** with its own connection pool — it would need to point at the right schema per run.
- `seed:diverse-reports` is destructive by design.

## Proposed scope

**A written design document, not an implementation.** Produce a comparison of at least three approaches:

| Approach | Sketch |
|---|---|
| **Schema-per-run** | `CREATE SCHEMA test_<runid>`, `search_path` per connection, drop at teardown |
| **Database-per-run** | Template database cloned per run (`CREATE DATABASE ... TEMPLATE ...`) |
| **Transaction rollback per test** | Hard here — the API is a separate process with its own pool |
| **Ephemeral container** | PostGIS in Docker for CI, seeded from a snapshot |

For each: what it costs to set up, how long a run takes with it, what it breaks, whether it works for both local and CI, and how reference-data seeding is handled (re-seeded per run? restored from a template? shared read-only?).

**Deliverable:** a recommendation with a rough implementation outline, added to `docs/testing.md` §9 or as its own doc if it grows past a section.

## Implementation notes

- Do not start implementing. The point is to make the tradeoff visible so the team can decide.
- Measure, don't guess: time how long the reference-data seed actually takes today — that number likely decides between the approaches.
- Consider a middle path: isolation for CI only, keeping local runs on the shared dev database.
- Note that PostGIS availability is a real constraint for a containerized option.

## Files likely involved

- `docs/testing.md` §9 (or a new design section)
- Read-only: `playwright.config.ts`, `e2e/global-setup.ts`, `api/scripts/migrations/`, `api/scripts/seed/`, `README.md` §D

## Acceptance criteria

- [ ] At least three approaches compared on setup cost, run time, CI compatibility, and reference-data handling.
- [ ] A measured figure for how long the current seed pipeline takes.
- [ ] A clear recommendation with rough effort sizing.
- [ ] An explicit statement of what would become possible (parallel workers, CI, repeated runs) and what would not.
- [ ] No code changed.

## Suggested tests

None — this is a design document. Verification is that the team can make a decision from it.

## Out of scope

**All implementation.** Also: changing `--workers=1`, adding Playwright to CI (#019, which depends on this), and any rate-limit change.

## Risks / notes

The main risk is this quietly turning into an implementation. If the recommendation is "not worth it yet," that is a perfectly good outcome — record it and move on.

## Claude Code handoff prompt

```
Write a design document comparing per-run test database isolation options for
PORAC-SDSS. THIS IS A SPIKE — do not implement anything.

Read first: docs/testing.md (all of it, especially §4, §8, §9),
playwright.config.ts, e2e/global-setup.ts, README.md §D (migration/seed order),
api/scripts/seed/, CLAUDE.md (the two-app architecture and the PG/Drizzle split).

Constraints that make this non-trivial and must be addressed:
- The schema needs PostGIS plus seeded reference data (barangay polygons, DEM
  points, city boundary), and setup order is load-bearing.
- The NestJS API is a separate long-lived process with its own connection pool.
- seed:diverse-reports is destructive by design.

Compare at least: schema-per-run, database-per-run (template clone),
transaction-rollback-per-test, and an ephemeral PostGIS container for CI.

For each, state: setup cost, expected run-time impact, what it breaks, whether
it works locally as well as in CI, and how reference-data seeding is handled.

MEASURE, don't guess: time how long the current reference-data seed actually
takes. That number probably decides the recommendation.

Also consider a middle path: isolation for CI only, shared dev DB locally.

Deliverable: a recommendation with rough effort sizing and an explicit list of
what it would unlock (parallel workers, Playwright in CI, repeated runs) and
what it would not. Add to docs/testing.md §9, or a new doc if it outgrows a
section.

DO NOT write implementation code, change --workers=1, or modify any test.
"Not worth it yet" is a valid recommendation if the evidence supports it.

Verify: git diff --check (docs only)
```
