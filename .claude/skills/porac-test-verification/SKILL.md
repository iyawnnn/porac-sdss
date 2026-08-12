---
name: porac-test-verification
description: Pick the smallest safe verification set for a PORAC-SDSS change — targeted Jest/Playwright specs instead of the full suite, respecting the report-creation rate limit and the shared dev database. Use when a change touches tests, Playwright specs, fixtures, auth flows, tickets, work orders, reports, or admin/citizen flows.
---

# PORAC-SDSS test verification

## When to use

- A change touches tests, Playwright specs, fixtures, or helpers.
- A change touches auth flows, tickets, work orders, reports, or any admin/citizen surface.
- Someone asks "what should I run?" before committing.

## When not to use

- Docs-only or comment-only changes with no runtime effect.
- Reviewing the diff's correctness → `porac-code-review`.
- Writing the feature itself → `porac-github-issue-implementation`.

## How to call it

```
Use porac-test-verification for the files changed.
Use porac-test-verification for this Playwright change.
Use porac-test-verification and recommend the smallest safe test set.
```

Read `docs/testing.md` for the layer/command reference and the full E2E data strategy before recommending anything.

## Rules

- **Do not recommend the full Playwright suite by default.** Targeted specs (`pnpm exec playwright test e2e/<spec>.spec.ts -- --workers=1`) or a `-g` title filter are the default.
- **Respect the rate-limit caveat**: a full run posts ~16 real reports against the 20/hour-per-IP backstop, so it can only be repeated about once an hour. Say this out loud whenever a broad run is genuinely warranted.
- **Avoid unnecessary real report creation** — reuse existing seeded data where a spec allows it; `pnpm --prefix api seed:diverse-reports` is destructive (`TRUNCATE`s tickets) and stays an explicit, separate step.
- `--workers=1` is required — there is no per-test DB isolation.
- **No shared "first ticket"/"top row" assumptions.** Specs run against a shared dev database; assert on a fixture the test itself created or can uniquely identify.
- **Prefer test-owned, disposable fixtures** over depending on whatever happens to be in the database.
- **No test-only bypasses** of auth, rate limits, or any anti-abuse control.
- **Never weaken a production control for test convenience**, and never change production behavior only to make a test pass.
- Use `settleAdminPage` (`e2e/helpers.ts`) when a spec loads a transient admin SSR screen — it absorbs the streaming/error-screen race instead of sleeping.
- All E2E credentials come from `e2e/test-credentials.ts`; never hardcode a login in a new spec.
- Playwright needs the API running and migrated first (`pnpm --prefix api start:dev`); `globalSetup` provisions the demo accounts.

## Output format

```
### What changed
- files, grouped by area

### Risk area
- what could realistically break

### Minimal test commands
- command — why this one covers the risk

### Optional broader commands
- command — when it's worth the extra time

### Not recommended
- command — why (cost, rate limit, no added coverage)

### Expected pass/fail notes
- known flakiness, prerequisites, or data state that affects the result
```

## Command reference (see `docs/testing.md` for the rest)

```
pnpm --prefix api test                                            # NestJS unit tests
pnpm --prefix api test:e2e                                        # NestJS e2e (not Playwright)
pnpm exec tsc --noEmit                                            # type check
pnpm exec playwright test e2e/admin-tickets.spec.ts -- --workers=1  # one spec
pnpm exec playwright test -g "office scoping" -- --workers=1        # by title
```