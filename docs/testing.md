# Testing

**How to verify changes to PORAC-SDSS, and the caveats that make this suite different from most.**

The short version: there is no mocked backend and no isolated test database. Playwright drives a real Next.js server against the real development database, with the NestJS API running separately. That buys unusually high confidence — the office-scoping tests genuinely prove the API clamps scope — at the cost of real constraints on how the suite can be run. Those constraints are documented here rather than worked around.

This file does not repeat setup instructions; see [`README.md`](../README.md) §C–§E for environment and database setup, and §I for the condensed run instructions.

---

## 1. Test types

| Layer | Command | What it covers |
|---|---|---|
| **Lint (root)** | `pnpm lint` | ESLint over the Next.js app |
| **Lint (API)** | `pnpm --prefix api lint` | ESLint over `api/src`, `api/test` — **note: runs with `--fix`, so it modifies files** |
| **Type check** | `pnpm exec tsc --noEmit` | No dedicated script exists; run it directly. Do the same inside `api/` for the API's own `tsconfig`. |
| **Next build** | `pnpm build` | Catches build-time failures type-checking alone misses (static generation, route conventions) |
| **API build** | `pnpm --prefix api build` | `nest build` — wipes `dist/` and the tsc buildinfo first (see [`CLAUDE.md`](../CLAUDE.md)) |
| **API unit tests** | `pnpm --prefix api test` | Jest across **36 spec files** in `api/src/**/*.spec.ts` — scoring, dedup, office routing, CSV writing, session service, OAuth linking, admin scope, guards. Fast, no database required. |
| **API e2e (Jest)** | `pnpm --prefix api test:e2e` | `api/test/app.e2e-spec.ts` with its own config. **Not** Playwright — a separate, NestJS-side harness. |
| **Browser E2E** | `pnpm exec playwright test -- --workers=1` | 19 spec files, roughly 200 tests, against a real server and database |

### What CI runs

`.github/workflows/ci.yml` runs five steps: API build-recovery check → API build → **API Jest tests** → root lint → root build.

**CI does not run Playwright.** It has no database and no running API, so the browser suite is a local-only gate today. Treat a green CI as "it compiles and the unit tests pass," not "the flows work."

---

## 2. Before running Playwright

Three things must be true. Playwright checks none of them for you except the third, indirectly.

1. **The database is migrated.** See [`README.md`](../README.md) §D. Order matters there.
2. **The NestJS API is running on `:3001`.**
   ```bash
   pnpm --prefix api start:dev
   ```
   Playwright's `webServer` config starts **only the Next.js app**, never the API. If the API is down, tests fail in confusing ways — usually on a missing element rather than a clear connection error.
3. **The Next.js app on `:3000`** — you generally do not need to start this yourself. `playwright.config.ts` declares `webServer` with `reuseExistingServer: !process.env.CI`, so it attaches to an already-running `pnpm dev` if there is one and otherwise starts its own (120 s startup budget). Override the origin with `PLAYWRIGHT_BASE_URL` if needed.

Default per-test timeout is **30 s**. Several specs raise it deliberately — `admin-tickets.spec.ts` and others use 60 s, and the resolution test uses 90 s because it performs a real Cloudinary upload.

---

## 3. Global setup: demo accounts

`e2e/global-setup.ts` runs once before any test and executes three API scripts in order:

| Script | Effect |
|---|---|
| `cleanup:e2e-admins` | Deletes throwaway `e2e-*@porac.gov.ph` admin accounts left by earlier runs |
| `seed:e2e-admins` | Upserts the three demo admin accounts |
| `seed:users` | Upserts the citizen demo accounts |

All three are idempotent `ON CONFLICT` upserts, so repeated runs never duplicate accounts. **You never need to run them by hand.** If they fail, global setup raises an error naming the likely cause (missing `api/.env`, or an unmigrated database) and pointing at README §D.

The `cleanup:e2e-admins` step exists for a specific reason: `admin-management`, `admin-password`, and `admin-activity-log` each create throwaway admin accounts. Without cleanup those accumulate across local runs until `/admin/admins` has enough rows to blow past test timeouts.

**Ticket and report demo data is deliberately not seeded here.** `seed:diverse-reports` is destructive — it `TRUNCATE`s `reports` and `tickets` before reinserting a fixed set, which would silently wipe whatever a developer is testing against. Run it explicitly when you want it:

```bash
pnpm --prefix api seed:diverse-reports
```

Specs that need seeded data call `test.skip()` with a message naming this command when the database has none, rather than failing.

### Credentials

All E2E credentials live in **`e2e/test-credentials.ts`** — three admin accounts (`E2E_MEO_ADMIN`, `E2E_MDRRMO_ADMIN`, `E2E_SYSTEM_ADMIN`) and `E2E_CITIZEN_ACCOUNT`. That file is also imported by `api/scripts/seed/seed-e2e-admins.ts`, so the seeder and the specs can never disagree.

**Never hardcode an email or password in a new spec.** Import from this module. The shared password is overridable via `E2E_DEMO_PASSWORD` for rotation without a source edit.

---

## 4. Why `--workers=1` is mandatory

The suite runs against one shared development database with no per-test transaction isolation and no schema-per-worker.

Parallel workers would race on the same admin sessions, ticket rows, filter state, and moderation state — one worker resetting filters while another asserts on them, or two workers advancing the same ticket's status. The resulting failures look like product bugs and are not.

Keep `--workers=1` until the suite gets real database isolation. That is a substantially larger change; see §9.

---

## 5. E2E data strategy

### Disposable tickets and reports

Specs that need a ticket **create their own** rather than selecting an existing one. The pattern (`createThrowawayReport` in `admin-tickets.spec.ts`, `createDisposableTicket` in `admin-work-orders.spec.ts`): sign up a fresh citizen, then `POST /api/reports` with a real image fixture and **jittered coordinates**.

The jitter (~±550 m) is not decoration. Pothole's deduplication merge radius is 25 m, so a fixed coordinate would silently merge every run's report into one shared ticket instead of creating a new one — the test would then be asserting against another test's fixture. `Pothole` is used because it always routes to MEO, so an MEO admin can act on it without reassignment.

### Why "first ticket" selection was removed

Ticket-dependent specs used to read "whichever ticket currently ranks first for this office." That was the suite's standing flake source: earlier specs create, resolve, and reassign tickets, so a later spec's "first ticket" could point at a different row — or one mid-mutation — than the one it read a moment earlier. Where a spec needs to find its own ticket in a list, it now filters by that ticket's id and locates the anchor whose `href` matches exactly, rather than trusting row order.

### Intentional fixture sharing

Some files create **one** disposable ticket in `beforeAll` and share it across tests: `admin-work-orders.spec.ts` (`sharedMeoTicketId`, `sharedMdrrmoTicketId`) and `admin-tickets.spec.ts` (`resolvedFixture`, which lets the resolution test and the citizen-side Case Closure test observe the same ticket from both sides).

This is safe **only** under `--workers=1`, and each site carries a comment saying so. Those tests need *a* ticket to attach uniquely-titled work orders to, not a pristine one. Sharing also directly reduces report creation, which matters for §6.

`admin-tickets.spec.ts` has its own such fixture, `sharedReadOnlyTicketId`, created once in a file-level `beforeAll` and reused by the three tests that only read a ticket — queue→detail navigation, Ticket Detail's read-only sections, and the mobile card list. None of the three assert on a specific status or office value, so a shared ticket can't leak state between them; the remaining call sites in that file all mutate status, office, or resolution and correctly keep their own disposable ticket (see the decision rule below).

`admin-reports.spec.ts`'s work-order CSV note-leak test goes one step further: rather than creating a disposable ticket at all, it queries whichever ticket already exists (`GET /api/admin/tickets?status=all&limit=1`) and attaches a sentinel-noted work order to that. It doesn't need a pristine or office-specific ticket — any ticket works, since the assertion is purely "the note text does not appear in the CSV" — so it adds zero reports rather than merely reducing them.

`admin-work-orders.spec.ts`'s three cross-office/assignee-validation gap tests (MDRRMO→MEO creation, cross-office `assignedAdminId`, deactivated `assignedAdminId`) reuse `sharedMeoTicketId`/`sharedMdrrmoTicketId` the same way — no new tickets or reports. The deactivated-assignee test does create one throwaway admin via the raw API (`POST /api/admin/admins` + `.../deactivate`), following `admin-management.spec.ts`'s create-then-deactivate pattern with the same `e2e-`-prefixed email convention `cleanup:e2e-admins` already relies on.

`admin-tickets.spec.ts`'s `describe.serial("MEO-initiated reassignment security")` block (4 tests) creates one throwaway ticket in its own `beforeAll` and shares it across all four — the first test moves it MEO→MDRRMO, so the "reassign a ticket you don't own" test needs no second ticket. One report total for the whole block.

### Decision rule: which fixture pattern to use

| Your test... | Use |
|---|---|
| mutates ticket status, office, or resolution | its own disposable ticket |
| only reads, or attaches uniquely-named child records | a file-level shared fixture, created once in `beforeAll` |
| needs to observe another test's outcome | explicit module state (e.g. `resolvedFixture`), commented, and only valid under `--workers=1` |
| needs no ticket at all | create none |

This is the rule the patterns above already follow — stated explicitly so a new spec doesn't have to re-derive it from precedent. `createThrowawayReport` (`admin-tickets.spec.ts`) and `createDisposableTicket` (`admin-work-orders.spec.ts`) are near-duplicate helpers with different call shapes (one takes an existing citizen `Page`, the other creates its own); they are deliberately left unconsolidated for now rather than risk obscuring the per-file comments that explain why sharing is safe in each.

### Transient-failure helpers

`e2e/helpers.ts` contains two recovery mechanisms. Both are narrowly scoped so they cannot mask a real regression:

- **`submitWithRetry`** — re-submits a login only when the specific transient connection error is visible on screen (25 s navigation budget, 3 attempts). A genuine credential or authorization failure renders different text and is never retried.
- **`settleAdminPage`** — reloads when the framework's server-error screen appears, and only then. This exists because **the admin SSR error boundary is still pending** (see [`security-hardening-plan.md`](security-hardening-plan.md) R10 and [`project-status.md`](project-status.md) §4.2). It is a test-side mitigation for an unfixed application gap, not a substitute for the fix.

---

## 6. The rate-limit caveat

**A full suite run posts roughly 15 real reports.** They come from four specs:

| Spec | Reports |
|---|---|
| `admin-tickets.spec.ts` | 6 |
| `citizen-dispute.spec.ts` | 6 |
| `admin-work-orders.spec.ts` | 2 (in `beforeAll`) |
| `citizen-reports.spec.ts` | 1 |

`RateLimitService` (`api/src/domain/ratelimit.service.ts`) backstops report submission at **20 per hour per IP** (`IP_HOURLY_BACKSTOP`), and every request in a local run originates from `127.0.0.1`.

Signing up a fresh citizen per test — which the specs already do — resets the per-account limits (5/hour, and 3 within 25 m per 24 hours) but **not** the IP limit. One full run fits inside the budget. A second full run started within the same hour does not.

### What a 429 looks like

Not an obvious "rate limited" message. It surfaces as:

- A failed `expect(res.ok()).toBe(true)` on report submission, or the explicit error thrown by `createThrowawayReport` including the status and body; **or**
- An entire spec file failing at once, if the limit is hit inside `admin-work-orders.spec.ts`'s `beforeAll`.

If several report-creating tests fail together and you have run the suite recently, check the clock before debugging the product.

### What to do

- **Wait out the hour**, or
- **Run only the specs you are working on** (§7).

**Do not add a test-only bypass, environment flag, or relaxed limit.** This is a real anti-abuse control protecting a public reporting endpoint, and it is behaving exactly as designed. Weakening a security control for test convenience is a standing prohibition — see [`security.md`](security.md) §8.3.

---

## 7. Recommended workflows

**Day to day — a single spec file:**
```bash
pnpm exec playwright test e2e/admin-tickets.spec.ts -- --workers=1
```

**Narrower still — by test title:**
```bash
pnpm exec playwright test -g "Case Closure Summary" -- --workers=1
pnpm exec playwright test -g "office scoping" -- --workers=1
```

**Fast feedback with no browser and no database:**
```bash
pnpm --prefix api test          # 36 spec files
pnpm exec tsc --noEmit
```

**Full suite — only when it earns it:** before a demo, before a significant merge, or after a change touching shared surfaces (the admin shell, session handling, office scoping). Not as a routine save-and-run.
```bash
pnpm exec playwright test -- --workers=1
```

**When touching auth, RBAC, or scoping**, the highest-value targeted runs are:
```bash
pnpm exec playwright test e2e/admin-rbac.spec.ts e2e/admin-password.spec.ts -- --workers=1
```
Neither creates reports, so both are safe to repeat freely.

---

## 8. Known limitations

- **No isolated test database.** The suite mutates the development database. Tickets, reports, work orders, and citizen accounts created by tests persist. This is why `--workers=1` is required and why `cleanup:e2e-admins` exists.
- **The full suite is slow.** Serial execution, real network round trips, and a real Cloudinary upload in the resolution test. Budget accordingly; do not put it in a save-hook.
- **The full suite cannot be run twice in an hour** (§6).
- **No test-only rate-limit bypass, by design.** Not an oversight — a deliberate refusal.
- **Playwright does not run in CI**, so browser-level regressions are caught only by whoever runs the suite locally.
- **Some specs skip rather than fail** when seed data is absent (`test.skip()` with a message naming `seed:diverse-reports`). This keeps reruns green on an already-exercised database, but it also means a fresh database silently loses coverage. Check for skips in the output, not just for failures.
- **No coverage gate.** `pnpm --prefix api test:cov` exists but nothing enforces a threshold.
- **No visual-regression testing.** Specs assert on roles and text, not screenshots or computed styles, so a purely visual regression will pass.

---

## 9. Future improvements

Not scheduled. Recorded so the reasoning is not re-derived.

- **Per-run database isolation** — a schema per run, or a transaction rolled back per test. This is the change that would unlock parallel workers and remove most of §8 at once. It is also by far the largest item here, which is why the suite still runs serially.
- **Wider fixture sharing — done for the read-only slice.** `admin-tickets.spec.ts` went from 8 report-creating call sites to 6 by sharing one `sharedReadOnlyTicketId` fixture across its three purely-read tests (§5). The remaining 5 call sites (dispute, status advancement, office reassignment, the reassignment-security `describe.serial` block, and admin-UI resolution) each mutate the ticket in a one-way, non-revertible way and correctly stay isolated — no further reduction is possible here without database isolation.
- **Playwright in CI** — needs an ephemeral PostGIS database plus a started API. Worth doing only after database isolation lands; otherwise CI inherits every constraint in §8.
- **Security-control assertions** for whatever ships from the hardening plan — a login-throttle test, and header assertions once headers exist.

---

## 10. Adding a new spec

A short checklist, derived from what the existing specs do:

1. Import credentials from `e2e/test-credentials.ts`. Never hardcode.
2. Use `loginAdmin` / `loginCitizen` from `e2e/helpers.ts` rather than writing a login flow.
3. If you need a ticket, create a disposable one with jittered coordinates. Do not select "the first ticket."
4. If several tests in the file can share one ticket, create it once in `beforeAll` and comment why sharing is safe.
5. Prefer asserting on roles and accessible names over CSS selectors.
6. Count how many reports your spec adds to the suite's ~15 (§6) and keep it as low as the test allows — use the decision rule in §5 to pick disposable-per-test, shared-per-file, or no ticket at all.
7. Never weaken or bypass a security control to make a test pass.
