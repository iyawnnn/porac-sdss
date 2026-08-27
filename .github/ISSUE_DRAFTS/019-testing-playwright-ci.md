# Add Playwright to CI (after database isolation)

**Labels:** `testing`, `ci`, `priority:p4`, `blocked`
**Type:** Enhancement (CI)
**Priority:** P4 — **blocked by #018/its implementation. Do not start before then.**

## Background

`docs/testing.md` §1 and §9. `.github/workflows/ci.yml` currently runs two parallel jobs: Frontend (typecheck, lint, build) and API (build-recovery check, build, unit tests).

**Playwright does not run in CI.** It has no database and no running API, so the browser suite is a local-only gate. A green CI means "it compiles and the unit tests pass," not "the flows work."

## Problem

Browser-level regressions — including every office-scoping and RBAC assertion, which are the suite's most valuable tests — are caught only by whoever remembers to run the suite locally. On a team, that is unreliable.

## Proposed scope

**Blocked until per-run database isolation exists** (#018 designs it). Adding Playwright to CI before then would inherit every constraint in `docs/testing.md` §8: a shared database, `--workers=1`, accumulating test data, and the hourly report rate limit.

Once unblocked:

1. Provision an ephemeral **PostGIS** database in the CI job.
2. Run the migration and seed pipeline in the documented order (`README.md` §D).
3. Start the NestJS API and wait for it to be healthy.
4. Run Playwright.
5. Upload the HTML report and traces as artifacts on failure.

## Implementation notes

- The API must be started separately — `playwright.config.ts`'s `webServer` boots only Next.js.
- `reuseExistingServer: !process.env.CI` already handles the CI case for the Next side.
- Reference-data seeding (barangays, DEM, city boundary) is the slow part. #018 should have measured it; a cached template or snapshot may be necessary to keep the job reasonable.
- CI needs real secrets: `DATABASE_URL`, `JWT_SECRET`, `CLOUDINARY_URL`, `OPENWEATHERMAP_API_KEY`, `CRON_SECRET`. **Decide deliberately** whether to use real Cloudinary/OpenWeatherMap credentials in CI or to accept that tests touching them will fail — the resolution test performs a **real Cloudinary upload**.
- Consider running a **subset** in CI (the RBAC and office-scoping specs, which create no reports) if the full suite proves too slow or too credential-hungry. That would deliver most of the value at a fraction of the cost, and is worth evaluating before committing to the full suite.

## Files likely involved

- `.github/workflows/ci.yml`
- `docs/testing.md` §1 and §9
- `docs/project-status.md` §4.3

## Acceptance criteria

- [ ] CI provisions PostGIS, migrates, seeds, starts the API, and runs Playwright.
- [ ] A failing browser test fails the CI job.
- [ ] Report and traces uploaded as artifacts on failure.
- [ ] Job duration is acceptable (state the measured time in the PR).
- [ ] `docs/testing.md` no longer says CI does not run Playwright.
- [ ] No test-only rate-limit bypass, and no weakened control, was added to make this work.

## Suggested tests

The CI job is the test. Verify by deliberately breaking one assertion and confirming CI goes red.

## Out of scope

Database isolation itself (#018), a CI job summary (#020), deployment (all of §4.4), and adding real production credentials to CI.

## Risks / notes

The temptation, if CI hits the report rate limit, will be to relax it for CI. **Do not** — that is a standing prohibition (`docs/security.md` §8.3). The correct answers are isolation, a subset, or fewer reports (#016).

## Claude Code handoff prompt

```
DO NOT START — blocked until per-run test database isolation exists for
PORAC-SDSS (see issue #018's design spike and its implementation).

When unblocked:

Read first: .github/workflows/ci.yml, playwright.config.ts, e2e/global-setup.ts,
README.md §D (migration/seed order — it is load-bearing), docs/testing.md §1,
§6, §8, §9.

Add a CI job that: provisions an ephemeral PostGIS database, runs the migration
and seed pipeline in the documented order, starts the NestJS API and waits for
health, runs Playwright, and uploads the HTML report and traces as artifacts on
failure.

Notes:
- playwright.config.ts's webServer starts only Next.js; the API must be started
  separately.
- Reference-data seeding (barangays, DEM, city boundary) is the slow part —
  consider a cached template or snapshot.
- The resolution test performs a REAL Cloudinary upload. Decide deliberately
  whether CI gets real credentials or whether that spec is excluded.
- STRONGLY CONSIDER running only a subset first (the RBAC and office-scoping
  specs, which create no reports). Most of the value, a fraction of the cost.

ABSOLUTELY DO NOT add a test-only rate-limit bypass or weaken any control to
make CI pass — standing prohibition, docs/security.md §8.3. If CI hits the
report limit, the answers are isolation, a subset, or issue #016.

Update docs/testing.md §1 and §9 (it currently states CI does not run
Playwright) and docs/project-status.md §4.3.

Verify: deliberately break one assertion and confirm CI goes red. State the
measured job duration in the PR.
```
