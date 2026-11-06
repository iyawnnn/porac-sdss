# Testing

**How to verify changes to PORAC-SDSS, and the caveats that make this suite different from most.**

The short version: there is no mocked backend and no isolated test database. Playwright drives a real Next.js server against the real development database, with the NestJS API running separately. That buys unusually high confidence — the office-scoping tests genuinely prove the API clamps scope — at the cost of real constraints on how the suite can be run. Those constraints are documented here rather than worked around.

This file does not repeat setup instructions; see [`README.md`](../README.md) §C–§E for environment and database setup, and §I for the condensed run instructions.

---


## Phase 7, step 7b-2: audit view verification and contract

No migrations, seed runner, Playwright, real database or push. The user reports 0047 applied to their disposable copy only. MIS guards/operational permissions are unchanged; actor_role and its enum remain permanently, including Phase 8.

**Files changed (29):**

- `CLAUDE.md`
- `api/scripts/lib/audit-view-fixtures.ts`
- `api/scripts/lib/demo-audit.ts`
- `api/scripts/seed/seed-demo-presentation.ts`
- `api/scripts/seed/seed-e2e-grouping-fixtures.ts`
- `api/src/admin/__snapshots__/admin-audit-view.spec.ts.snap`
- `api/src/admin/admin-audit-source.spec.ts`
- `api/src/admin/admin-audit-view.spec.ts`
- `api/src/admin/admin-audit-view.ts`
- `api/src/admin/admin-audit.service.spec.ts`
- `api/src/admin/admin-audit.service.ts`
- `api/src/admin/admins.service.ts`
- `api/src/contracts/admin-audit.ts`
- `api/src/db/schema.ts`
- `api/test/audit-view.pglite.cjs`
- `api/test/citizen-notifications.pglite.cjs`
- `api/test/staff-accounts.pglite.cjs`
- `app/admin/activity-log/page.tsx`
- `components/features/admin/activity-log/ActivityLogWorkspace.tsx`
- `docs/database.md`
- `docs/features.md`
- `docs/project-status.md`
- `docs/security.md`
- `docs/testing.md`
- `docs/user-flows.md`
- `e2e/admin-activity-log.spec.ts`
- `e2e/admin-tickets.spec.ts`
- `e2e/admin-work-orders.spec.ts`
- `lib/types/admin-audit.ts`

**Before:** envelope `{ events, total, page, limit, totalPages }`; event keys exactly `id, actor_admin_id, actor_name, actor_email, actor_role, actor_account_type, actor_office, action_type, target_type, target_id, target_summary, metadata, created_at`. Metadata was unfiltered and summaries could contain operational/citizen text.

**After:** same envelope; event exactly `{ id, created_at, action, target_type, target_id, target_label, actor: { id, name, account_type, is_focal, display_label }, details }`. created_at is ISO. details is a flat primitive-only object. No target_summary/raw metadata/email/reason/remark/note/title/description/citizen text/coordinate/assignee id/cancellation reason is serialized. Neutral Ticket/Report/Work order #id labels; staff target name is a live lookup without email (or a not-recorded fallback). Unknown action codes have empty details; malformed action/target strings become unknown.

**Actor labels:** every new service insert reads role, account type, Focal and office from the stored actor in its INSERT, for raw-PG/Drizzle/login paths. True Focal means Focal Personnel; false uses recorded account type/office (System Administrator/MIS, MEO Personnel, MDRRMO Personnel). Legacy NULL uses recorded actor_role: focal=Focal Personnel, system_admin=System Administrator/MIS, officer/supervisor=Personnel. Recorded actor_office alone supplies MEO/MDRRMO. Missing office stays Personnel - office not recorded; never inferred from current staff or old role. No historical row changes.

**Exact per-action allow-list:** source paths below flatten dot to underscore (from.office becomes from_office). movedReportIds becomes only moved_reports_count. Category names map from the explicit current/legacy vocabulary to uppercase short codes; unknown names are omitted. Other strings must match a strict pattern, length <=40 and the field's pinned enum. Booleans must be booleans, counts nonnegative integers, explicit NULL remains NULL. Unknown keys/actions and invalid values are omitted. No speculative member-count field is exposed because writers do not currently record one.

| Action | Allowed source metadata paths |
|---|---|
| `admin_created` | `accountType`, `isFocal`, `office` |
| `admin_role_updated` | `from.accountType`, `to.accountType`, `from.isFocal`, `to.isFocal`, `from.office`, `to.office`, `sessionsEnded` |
| `admin_password_changed` | None |
| `admin_password_reset` | None |
| `admin_deactivated` | `from.active`, `to.active`, `sessionsEnded` |
| `admin_reactivated` | `from.active`, `to.active`, `sessionsEnded` |
| `admin_login` | None |
| `admin_login_failed` | None |
| `ticket_status_advanced` | `from`, `to`, `outcome` |
| `ticket_reassigned` | `from`, `to` |
| `ticket_referral_noted` | None |
| `ticket_rejected` | `from`, `to` |
| `ticket_returned_to_review` | `from`, `to`, `previousOutcome` |
| `ticket_category_corrected` | `oldValue`, `newValue`, `officeChanged`, `fromOffice`, `toOffice` |
| `ticket_location_corrected` | None |
| `report_moderated` | `action` |
| `work_order_created` | `assignedOffice`, `hasDueDate` |
| `work_order_updated` | None |
| `work_order_status_changed` | `from`, `to` |
| `work_order_completed` | `from`, `to` |
| `work_order_cancelled` | `from`, `to` |
| `report_acknowledged` | None |
| `report_screened` | None |
| `report_severity_screened` | `oldStatus`, `newStatus` |
| `report_escalated` | None |
| `operational_assessment_created` | None |
| `operational_assessment_updated` | None |
| `ticket_merged` | `movedReportIds` |
| `report_removed_from_ticket` | None |
| `report_regrouped` | None |

Codes: ticket status Reported/Under Review/In Progress/Resolved/Rejected; Work Order pending/in_progress/completed/cancelled; office MEO/MDRRMO; account PERSONNEL/SYSTEM_ADMIN; outcome MUNICIPAL_ACTION_COMPLETED/EXTERNAL_REFERRAL; moderation dismiss/quarantine/duplicate; screening NOT_REVIEWED/NO_CONCERN_NOTED/REQUIRES_OPERATIONAL_VALIDATION. Full validators and known-category code mapping: api/src/admin/admin-audit-view.ts; strict allow-list snapshot: api/src/admin/__snapshots__/admin-audit-view.spec.ts.snap.

**Full shared action/label list:** api/src/contracts/admin-audit.ts is shared by API/web; its map satisfies an exhaustive Record type. Retired events remain filterable.

| Action | Label |
|---|---|
| `admin_created` | Admin created |
| `admin_role_updated` | Account type/office/Focal updated |
| `admin_password_changed` | Password changed |
| `admin_password_reset` | Password reset |
| `admin_deactivated` | Admin deactivated |
| `admin_reactivated` | Admin reactivated |
| `admin_login` | Admin login |
| `admin_login_failed` | Admin login failed |
| `ticket_status_advanced` | Ticket status advanced |
| `ticket_reassigned` | Ticket reassigned |
| `ticket_referral_noted` | Referral recorded |
| `ticket_rejected` | Ticket rejected |
| `ticket_returned_to_review` | Ticket returned to Under Review |
| `ticket_category_corrected` | Ticket category corrected |
| `ticket_location_corrected` | Ticket location corrected |
| `report_moderated` | Report moderated |
| `work_order_created` | Work order created |
| `work_order_updated` | Work order updated |
| `work_order_status_changed` | Work order status changed |
| `work_order_completed` | Work order completed |
| `work_order_cancelled` | Work order cancelled |
| `report_acknowledged` | Report acknowledged |
| `report_screened` | Report screened (retired) |
| `report_severity_screened` | Report severity screened |
| `report_escalated` | Report escalated (retired) |
| `operational_assessment_created` | Operational assessment created |
| `operational_assessment_updated` | Operational assessment updated |
| `ticket_merged` | Tickets merged |
| `report_removed_from_ticket` | Report removed from ticket |
| `report_regrouped` | Report moved to another ticket |

**Seed:** presentation audit DELETE removed. No audit TRUNCATE or trigger disabling added; existing operational resets are unchanged. DemoAuditService takes a per-target transaction advisory lock and skips an existing event with identical actor/action/target type/id/JSONB metadata (NULL metadata equals empty object). This also recognizes untagged old demo events. Different transitions/actors/metadata remain distinct. Both transaction-client paths pass PGlite checks. Source scan covers app/scripts/E2E and finds no audit UPDATE/DELETE. Historical migration SQL is excluded: 0039's unchanged WHERE actor_account_type IS NULL backfill matches no row after its NOT NULL constraint.

**E2E fixture design (not run):** grouping setup calls an INSERT-only helper. Each run reserves an audit sequence value plus 1,000,000,000 as a distinctive soft ticket target id, inserts all 30 actions at 2026-11-05T15:59Z and an extra login at 16:00Z, then exposes ids through E2E_GROUPING_FIXTURES.auditView. Rows may accumulate forever; no real ticket/report or citizen creation. November 5 Manila returns 30, November 6 returns one. The activity spec checks every filter label, nine formerly blank badges, a real distinctive staff create/edit with from-to and no reason/email, actor/target-id and date inputs. Existing ticket/work-order specs query their own ids and use safe actor/details/action fields. Zero added citizen-report POSTs. Playwright remains a separate user-run step.

**Final verification:** API 75 suites / 1,783 tests and one allow-list snapshot pass; API build, root type-check, root 34 unit tests and pnpm web production build pass. Audit PGlite 5 groups; staff-account PGlite 8; citizen-notification PGlite 24. The new harness matches DbModule with drizzle(postgresClient), rejects raw JS Date parameters, and runs all three actors across all three audit insert paths, real filters/count/pagination/live-name queries, Manila midnight split, seed dedupe with old-row preservation, and accumulating E2E fixture inserts under an append-only trigger. Build API first, set PGLITE_MODULE_ROOT to the scratch PGlite/socket project and TSX_TSCONFIG_PATH=api/tsconfig.json, then run node api/test/audit-view.pglite.cjs. It imports helper functions only, never a seed runner, scripts/db.ts or .env. No external email.

**Mutations:** a planted SECRET_REASON response field failed 31 privacy tests; removing Manila's eight-hour offset failed its boundary test; removing admin_login's label failed exhaustive label coverage. A temporary Jest config disabled diagnostics for mutation runs so the missing-label runtime assertion executed; normal checks retain type checking. Original source buffers restored byte-for-byte, final tests/build pass, no mutation remains.

**Lint:** touched web/E2E/types files, new/changed audit TypeScript/helpers and all touched CJS harnesses pass. The presentation seed retains 18 prettier findings and schema.ts one, matched at unchanged lines against main (19 total); no new findings. No wholesale reformatting. Web build ran in a temporary source copy with only its Turbopack root widened to resolve linked dependencies and automatic pnpm install disabled. Sandbox dependency access required escalation; build passed. Original .next existed and remains; next-env.d.ts, api/pnpm-workspace.yaml and api/.env untouched.

## 1. Test types

**Phase 7, step 7a staff account management.** `admins.service.spec.ts` covers type/office/Focal session bumps, no-op edit/status writes, invalid combinations, last-active removal/deactivation, self-edit/deactivation, inactive account edits/reactivation, another administrator's edit, the unchanged legacy role mirror and one audit event per real change. `session.service.spec.ts` checks rejection before the bump and same-second authority mismatches. Audit specs pin both actor fields to the stored account rather than mixing the session with the role mirror.

`api/test/staff-accounts.pglite.cjs` runs the real Admins, Audit and Session services through `drizzle(postgresClient)`, matching DbModule's serialization. Its disposable fixture schema checks each write path, session timestamps, validation/no-op preservation, audit-failure rollback of both fields and timestamp, execution of the ordered active-only and target `FOR UPDATE` queries, sequential demotions with two active administrators plus an inactive administrator (only the first succeeds), and stored-actor snapshots in Drizzle/raw-PG/login inserts. Build the API, install PGlite/socket in a separate scratch npm project, set `PGLITE_MODULE_ROOT` to that directory, then run `node api/test/staff-accounts.pglite.cjs`. No `.env`, migration/seed runner or real database is used. The existing citizen-notification harness's minimal admin fixture now includes account type for the shared audit writer.

`e2e/admin-management.spec.ts` extends its existing created staff account with field enabling/clearing assertions in create/edit, an office edit and rejection of the old staff session, plus own-row disabled controls, self-edit refusal and last-active deactivation (409 takes precedence over self-deactivation). It uses the existing login/settle helpers; no new citizen sign-ups or report POSTs and no additional staff creation. Full-run citizen-report POST budget stays **15**. No component-render unit-test pattern exists in this repository; UI behavior is covered by these browser assertions. **Playwright was not run.**

**7a verification:** API unit tests **73 suites / 1,730 tests passed**; API build, root type-check, root unit tests (**34 passed**) and web production build passed. Staff PGlite **8 check groups passed**; existing citizen-notification PGlite **24 check groups passed**. Web/E2E lint and both CJS harnesses (ESLint recommended Node rules) passed. Touched API TypeScript lint retains only **2 existing unsafe-assignment errors** in `session.service.spec.ts`; the same six files on `main` report **63 errors**, including these two. No new lint findings. The web build ran with the pinned pnpm in a temporary source copy; only that copy's Turbopack root was widened to resolve its linked dependencies, and dependency auto-install was disabled for the copy. The original `.next` existed beforehand and was retained; `next-env.d.ts` was untouched.

Mutation checks: removing the edit session bump failed **5 unit tests**; including inactive System Administrators in the locked set failed the PGlite second-demotion refusal. Both mutations were restored, the source bytes matched the pre-mutation source, and the final API build/unit/PGlite runs passed. Final diff review confirms no mutation leftovers. No migrations, seeds, Playwright or push were run.

**Phase 7, step 7.0 CSV formula-injection neutralisation** (`docs/security.md` §7.6). Unit tests only, no database, no Playwright, no report posts:

- `api/src/common/utils/csv.spec.ts` — each trigger (`=`, `+`, `-`, `@`, tab, CR) at the start gets exactly one apostrophe; a trigger in the middle or end, or after a leading space, is untouched; numbers (negative, zero, decimal), bigints and booleans are untouched; `null`, `undefined` and `''` stay empty; quoting still works on a prefixed cell (commas, quotes, newlines, and the CR trigger itself); a value is never prefixed twice; the header row follows the same rule; ordinary text and ISO dates are unchanged.
- `api/src/admin/reports.service.spec.ts` — one hostile-value test per export: `tickets.csv` (category, barangay, Hazard Information), `flagged.csv` (title, citizen name, category, barangay, flags, moderator) and `work-orders.csv` (title, assignee name and email) cells start with the apostrophe, while ids, counts, Operational Priority and the mismatch distance stay plain numbers. The existing ordinary-data tests still pass unchanged, so normal output is identical.
- `api/src/common/utils/csv-writer-only.spec.ts` — a source scan of `api/src`, `api/scripts`, `app`, `components`, `lib`, `scripts`, `proxy.ts` and `next.config.ts` (test files excluded) that fails on a second CSV path: a `text/csv` response outside `reports.controller.ts`, CSV quote-doubling or CRLF joining outside `csv.ts`, a CSV library import, a browser-built CSV download, or a `ReportsService` `…Csv` method that doesn't return `toCsv(...)`.

**7.0 verification:** API unit tests **73 suites / 1,717 tests passed**; API build passed; root type-check passed; root unit tests **34 passed**. Mutations: making `neutraliseFormula` return its input failed 12 tests (every neutralisation test, including the three export tests); neutralising numbers too failed the two number/bigint tests; a planted `text/csv` Blob file in `components/` failed two scan tests. All were reverted (no leftover in `git diff`). Lint on touched files: `csv.ts` and the new scan spec are clean (main's one `csv.ts` error is gone); `csv.spec.ts` keeps main's 2 prettier errors on untouched lines and `reports.service.spec.ts` keeps main's 28, with none in the new tests. Full-project API `tsc --noEmit` still reports 11 errors, all in untouched files already on `main` (`admin-account.service.spec.ts`, `dashboard.service.spec.ts`, `scripts/seed/seed-demo-presentation.ts`). Web build skipped (no web code changed). Playwright was not run.

**Phase 6, step 6c citizen notifications.** `citizen-notices.spec.ts` pins the five new texts, distinct-recipient query, agency allowlist, outcome/legacy resolved notice/email copy and a source scan scoped to notification builders and the resolved email (the citizen report page intentionally retains resolution notes). `notifications.service.spec.ts` strictly pins the seven-field citizen item and rejects unsafe legacy links. Acknowledgment/feedback/status unit tests cover the changed wiring.

`api/test/citizen-notifications.pglite.cjs` exercises the real Tickets, Focal Intake, category-correction, Reports, Notifications and Audit services through a `drizzle()`-wrapped postgres.js client. It creates only an in-memory fixture schema, rejects raw JS Date parameters, stubs email/scoring/weather/media, and proves distinct reporters, all five notice paths, merged-away exclusions, both resolved outcomes and legacy delivery, acknowledgment/return deduplication, author-only feedback (including a report left on a merged ancestor), strict response shape, rejection preservation and real SQL failures/partial fan-out rollback without losing the action/audit. Build API first; install `@electric-sql/pglite` and `@electric-sql/pglite-socket` in a separate scratch npm project, set `PGLITE_MODULE_ROOT` to that project's directory, then run `node api/test/citizen-notifications.pglite.cjs`. No `.env`, migration/seed runner or real email is used. Legacy copy is also pinned in unit tests. Mutation checks append a routing reason to a referred notice and remove `DISTINCT ON`; each must fail before reverting the mutation.

The existing `admin-routing`, `admin-resolution`, `citizen-resolution-feedback` and `admin-focal` Playwright specs add citizen API and bell checks via `citizen-notification-checks.ts`. They reuse global-setup SQL fixtures; acknowledgment now uses the existing Reported `routing.focalWorkOrder` fixture instead of picking arbitrary seed data. No fixtures added and no new citizen-report POSTs: **15 per full run**. Existing teardown retirement still clears resolution fields in the same status UPDATE. Playwright is a separate user-run step; do not infer that it passed from these unit/PGlite checks. Use the console email provider for any browser run (real production email must never be used by tests).

**6c verification:** API unit tests **72 suites / 1,692 tests passed**; PGlite **24 check groups passed**; root unit tests **34 passed**; root type-check, API build, web build and touched web/E2E-file lint passed. The web build ran with `pnpm build` in a temporary source copy so the existing `next-env.d.ts` and root `.next` remained untouched. Both mutations failed on the intended behavior (reason leaked into the referred message; duplicate recipient for two reports by one citizen), then were restored; the final PGlite run passed. Full touched API-file lint still reports **37 errors / 3 warnings**, all matched to findings already on `main` (baseline **72 errors / 3 warnings** across the touched existing files); no new lint findings. Remaining findings are in `focal-intake.service.spec.ts`, `tickets.service.spec.ts`, `notifications.service.spec.ts`, `reports.service.ts`, `email-templates.ts` and `email.service.ts`. Playwright was not run.

| Layer | Command | What it covers |
|---|---|---|
| **Lint (root)** | `pnpm lint` | ESLint over the Next.js app |
| **Lint (API)** | `pnpm --prefix api lint` | ESLint over `api/src`, `api/test` — **note: runs with `--fix`, so it modifies files** |
| **Type check** | `pnpm exec tsc --noEmit` | No dedicated script exists; run it directly. Do the same inside `api/` for the API's own `tsconfig`. |
| **Next build** | `pnpm build` | Catches build-time failures type-checking alone misses (static generation, route conventions) |
| **API build** | `pnpm --prefix api build` | `nest build` — wipes `dist/` and the tsc buildinfo first (see [`CLAUDE.md`](../CLAUDE.md)) |
| **API unit tests** | `pnpm --prefix api test` | Jest across **73 spec files** in `api/src/**/*.spec.ts` — scoring, dedup, office routing, CSV writing (tickets, work orders and flagged reports) and CSV formula-injection neutralisation, session service, OAuth linking, admin scope, guards, ticket-queue view counts and bulk-action eligibility, and saved-view surface scoping. Fast, no database required. |
| **API e2e (Jest)** | `pnpm --prefix api test:e2e` | `api/test/app.e2e-spec.ts` with its own config. **Not** Playwright — a separate, NestJS-side harness. |
| **Browser E2E** | `pnpm exec playwright test -- --workers=1` | 19 spec files, roughly 200 tests, against a real server and database |

### What CI runs

`.github/workflows/ci.yml` runs on every pull request into `dev` or `main`, and on every push to either — two independent jobs in parallel, so a frontend failure and an API failure are never conflated on the PR checks list:

- **Frontend job:** install (frozen lockfile) → `pnpm exec tsc --noEmit` → `pnpm lint` → `pnpm build`.
- **API job:** install (frozen lockfile) → `verify:build-recovery` → `pnpm --prefix api build` → **`pnpm --prefix api test`**.

**API lint does not run in CI**, deliberately — `pnpm --prefix api lint` runs with `--fix` and would modify files, which a CI check must never do. Run it locally before opening a PR instead (see §1's table above).

**CI does not run Playwright.** It has no database and no running API, so the browser suite is a local-only gate today — see issue #018/`docs/testing-db-isolation-spike.md` for why, and issue #019 for what would need to change first. Treat a green CI as "it typechecks, lints, builds, and the unit tests pass," not "the flows work."

---

## 2. Before running Playwright

Three things must be true. Playwright checks none of them for you except the third, indirectly.

1. **The database is migrated.** See [`README.md`](../README.md) §D. Order matters there.
2. **The NestJS API is running on `:3001`, with DENR-MGB and rainfall lookups switched off.**
   ```bash
   HAZARD_INFORMATION_LOOKUPS=disabled RAINFALL_LOOKUPS=disabled pnpm --prefix api start:dev
   ```
   `RAINFALL_LOOKUPS=disabled` does the same for the OpenWeatherMap rainfall context (manuscript revision Phase 4, step 4c): opening a flood/landslide ticket with no reading, or one over 10 minutes old, would otherwise call the live service. Stored `rainfall_context` rows (the seeded fixtures) still show.
   Playwright's `webServer` config starts **only the Next.js app**, never the API. If the API is down, tests fail in confusing ways — usually on a missing element rather than a clear connection error. Tests must never call the live DENR-MGB service (manuscript revision Phase 4, step 4b): with lookups enabled, a report or category correction to Localized Flooding, or opening a flood/landslide ticket with no result, would start a real lookup. `disabled` makes every lookup a no-op that writes nothing; stored Hazard Information rows still show. The variable is read at API startup (it overrides `api/.env`), so nothing in `api/.env` needs editing.
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

**One exception: the grouping fixtures** (manuscript revision Phase 3, step 3d). After the accounts, global setup runs `seed:e2e-grouping-fixtures`, which inserts a few tickets and reports for citizen1 directly (no `POST /reports`, so no rate-limit cost) in Jalung, each title starting "E2E grouping fixture", (step 3e) "E2E correction fixture" or (step 3g) "E2E feedback fixture", and passes their ids to `e2e/admin-ticket-grouping.spec.ts`, `e2e/admin-ticket-corrections.spec.ts`, (step 3f) `e2e/admin-severity-screening.spec.ts` and (step 3g) `e2e/citizen-resolution-feedback.spec.ts` through `process.env.E2E_GROUPING_FIXTURES`. The step 3f fixture's report also carries one old `'screened'` intake action. The step 3g fixture is a Resolved ticket with one report by citizen1 and one by citizen2 (`E2E_SECOND_CITIZEN_ACCOUNT`). (Phase 4, step 4b) "E2E hazard fixture" tickets — six active MDRRMO tickets, one per Hazard Information panel state — get their `hazard_information` rows inserted directly, for `e2e/admin-hazard-information.spec.ts`, which never clicks Retry. (Step 4c) The same tickets get `rainfall_context` rows (CURRENT 0 mm with history, STALE, UNAVAILABLE, none), plus one Rejected "E2E hazard fixture" flood ticket with a stored reading, for `e2e/admin-rainfall-context.spec.ts`, which never clicks Refresh; the Rejected one is already closed, so nothing retires it. (Phase 5, step 5a) Six "E2E routing fixture" MEO tickets 400–550 m north of the grouping spots — Reported (Focal reassigns it), Under Review and Reported with a pending Work Order (Focal refused), a Leaking Pipe referral ticket Under Review (MEO refers, then reassigns it), Under Review with a pending Work Order (MEO refused) and Rejected (no routing, New Work Order or Add Assessment) — for `e2e/admin-routing.spec.ts`. (Step 5b) Every fixture that carries a pending Work Order also gets an Operational Assessment (a new Work Order needs one), and three "E2E work order fixture" Under Review tickets 610–670 m north of the grouping spots — MEO with no assessment, MEO with one, MDRRMO with one — serve `e2e/admin-assessment-work-orders.spec.ts` (assessment-first message, cancel reason, final Work Orders, same-ticket replacement, Rejected refusals on the routing Rejected fixture); the two assessed ones are also where `admin-notifications.spec.ts`, `admin-reports.spec.ts` (CSV note leak) and `admin-work-orders.spec.ts` (citizen note leak) create their Work Orders, instead of on a demo ticket. (Step 5c) Four "E2E resolution fixture" MEO tickets 760–850 m north of the grouping spots — In Progress with no referral and no Work Order (the outcome / notes and External Referral refusals, then a Municipal action completed resolution through the dialog), In Progress with a pending Work Order and an assessment (resolve refused), an In Progress Leaking Pipe ticket with one referral recorded the way `logReferral` writes it (a `routing_actions` REFER row and its `ticket_referral_noted` audit event; resolved by External Referral, returned to Under Review, resolved again) and a legacy Resolved one (the 0036 outcome, no `resolved_at`, no notes) — serve `e2e/admin-resolution.spec.ts`; (Phase 6, step 6a) five Reported MEO Pothole tickets 880–1000 m north, each with one citizen1 report — three "E2E ticket fixture" ones for `e2e/admin-tickets.spec.ts` (the shared read-only ticket, whose title ends in the run's timestamp, the advance-status ticket and the reject ticket) and two "E2E citizen fixture" ones (the public-map lifecycle ticket for `e2e/citizen-map.spec.ts` and an unresolved report for `e2e/citizen-dispute.spec.ts`), replacing report posts (§6); (step 6b) eight more "E2E citizen fixture" tickets 1030–1240 m north for `e2e/citizen-report-page.spec.ts`, all read-only — a Leaking Pipe ticket Under Review with two referrals (DPWH, and a typed agency), one resolved by External referral and returned to Under Review (status_history In Progress → Resolved with the snapshot → Under Review with a reason), a staff merge (citizen1's older report moved onto a newer ticket carrying citizen2's report, a `ticket_merged` audit event listing it, and the ticket-level acknowledgment left on the merged-away ticket), an acknowledged ticket (per-report and ticket-level rows), and three Resolved ones (Municipal action completed, External referral with a referral, and legacy) — each carrying "staff-only" sentinel text (reasons, remarks, earlier notes) the spec checks never reaches the citizen page; the step 3g Resolved fixture now carries a full resolution record (`resolved_at`, `resolved_by_admin_id`, notes, outcome) so migration 0046's CHECKs hold. `e2e/global-teardown.ts` (`cleanup:e2e-grouping-fixtures`) retires them afterwards: every still-active ticket (and every Resolved step 3g or step 5c fixture ticket) whose reports are all fixture reports is set to Rejected with a `status_history` row, its resolution record (outcome, notes, photo, `resolved_at`, `resolved_by_admin_id`) cleared in the same UPDATE, after its active Work Orders are cancelled — since step 5b with `cancelled_at`, the MEO demo admin as `cancelled_by_admin_id` and the reason "E2E fixture cleanup", so `work_orders_cancellation_check` holds — with a history row. The MEO demo admin is not an `e2e-%` account, so `cleanup:e2e-admins` never deletes it. Nothing is deleted; setup does the same retirement first, so a run whose teardown never ran is cleaned up by the next.

**Ticket and report demo data is deliberately not seeded here.** `seed:diverse-reports` is destructive — it `TRUNCATE`s `reports` and `tickets` before reinserting a fixed set, which would silently wipe whatever a developer is testing against. Run it explicitly when you want it:

```bash
pnpm --prefix api seed:diverse-reports
```

Specs that need seeded data call `test.skip()` with a message naming this command when the database has none, rather than failing.

### Credentials

All E2E credentials live in **`e2e/test-credentials.ts`** — four admin accounts (`E2E_MEO_ADMIN`, `E2E_MDRRMO_ADMIN`, `E2E_SYSTEM_ADMIN`, `E2E_FOCAL_ADMIN` — five-role Batch 5) and `E2E_CITIZEN_ACCOUNT` (plus `E2E_SECOND_CITIZEN_ACCOUNT`, citizen2, step 3g). That file is also imported by `api/scripts/seed/seed-e2e-admins.ts`, so the seeder and the specs can never disagree. `loginAdmin` (`e2e/helpers.ts`) is role-aware: it waits for each role's actual post-login landing page/heading (`/admin` for officer/supervisor, `/admin/focal` for focal, `/admin/admins` for system_admin) rather than assuming every role lands on the operational Dashboard — `system_admin` and `focal` never do, since Batch 1 removed system_admin's operational access and focal never had it.

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

Some files create **one** disposable ticket in `beforeAll` and share it across tests: `admin-work-orders.spec.ts` (`sharedMeoTicketId`, `sharedMdrrmoTicketId`) — since step 5b `beforeAll` also records an Operational Assessment on both, through the API, so Work Orders can be created on them — and `admin-tickets.spec.ts` (`resolvedFixture`, which lets the resolution test and the citizen-side Case Closure test observe the same ticket from both sides).

This is safe **only** under `--workers=1`, and each site carries a comment saying so. Those tests need *a* ticket to attach uniquely-titled work orders to, not a pristine one. Sharing also directly reduces report creation, which matters for §6.

`admin-tickets.spec.ts` has its own such fixture, `sharedReadOnlyTicketId`, created once in a file-level `beforeAll` and reused by the three tests that only read a ticket — queue→detail navigation, Ticket Detail's read-only sections, and the mobile card list. None of the three assert on a specific status or office value, so a shared ticket can't leak state between them; the remaining call sites in that file all mutate status, office, or resolution and correctly keep their own disposable ticket (see the decision rule below).

`admin-reports.spec.ts`'s work-order CSV note-leak test goes one step further: rather than creating a disposable ticket at all, it uses the assessed MEO step 5b fixture ticket (or, without the fixtures, the first active ticket, `GET /api/admin/tickets?limit=1` — a Rejected one would refuse the Work Order since step 5b) and attaches a sentinel-noted work order to that, after `ensureAssessment` (`e2e/helpers.ts`) adds an assessment if the ticket has none. It doesn't need a pristine or office-specific ticket — any ticket works, since the assertion is purely "the note text does not appear in the CSV" — so it adds zero reports rather than merely reducing them.

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
- **`settleAdminPage`** — reloads when the framework's server-error screen appears, and only then. The admin SSR error boundary (`app/admin/error.tsx`, R10) has since shipped (see [`project-status.md`](project-status.md) §4.2) — this helper now stays purely as defense-in-depth for mid-run connection churn between navigations, not a mitigation for an unfixed gap.

---

## 6. The rate-limit caveat

**A full suite run posts 15 real reports** (manuscript revision Phase 6, step 6a). **Keep it at 16 or fewer**, so a full run leaves headroom under the 20-an-hour limit; a new test that needs a fresh active ticket gets a fixture from `api/scripts/seed/seed-e2e-grouping-fixtures.ts` (§3), not a `POST /reports`. They come from four specs:

| Spec | Reports |
|---|---|
| `admin-tickets.spec.ts` | 6 (4 `createThrowawayReport` — dispute section, reassign UI, the serial reassignment block's `beforeAll`, the UI resolution — and the 2 referral reports, which must start alone in their area) |
| `citizen-dispute.spec.ts` | 4 |
| `citizen-reports.spec.ts` | 3 (notification click-through, and the two new MEO categories) |
| `admin-work-orders.spec.ts` | 2 (in `beforeAll`) |
| `citizen-map.spec.ts` | 0 |

**Before step 6a** the specs made 21 report posts, of which 20 created reports: the old table above said 17 because it predated the two referral reports in `admin-tickets.spec.ts` (Phase 3, step 3c / Phase 5, step 5a) and the two new-category reports in `citizen-reports.spec.ts` (Phase 2), and the 21st post — in `citizen-dispute.spec.ts`'s "Case Closure Summary does not appear on an unresolved report" — was sent without a citizen session, so it got a 401 and created nothing (that test then opened `/dashboard/reports/undefined` and passed without showing a report). Step 6a moved five tests off `POST /reports`, with the same assertions:

| Test | Was | Now |
|---|---|---|
| `admin-tickets.spec.ts` shared read-only ticket (`beforeAll`; queue→detail, Ticket Detail sections, mobile cards, the Direct-responsibility check) | a posted report with a timestamped title | the `tickets.sharedReadOnly` fixture, whose title also ends in the run's timestamp |
| `admin-tickets.spec.ts` "advancing a ticket's status…" | a posted report | the `tickets.advanceStatusTicketId` fixture (Reported) |
| `admin-tickets.spec.ts` "rejecting a fresh ticket…" | a posted report | the `tickets.rejectTicketId` fixture (Reported) |
| `citizen-map.spec.ts` lifecycle (Reported → Under Review → In Progress → Rejected) | a posted report by a fresh citizen, found on the map by ticket id | citizen1's `citizen.publicMapLifecycle` fixture, found on the map by its `own_report_id` (the map no longer sends ticket ids) |
| `citizen-dispute.spec.ts` "dispute action appears only on a resolved report…" | a second posted report just for the unresolved check | the same report, checked before it is resolved and again after |

and fixed the vacuous Case Closure test: it now signs in as citizen1, opens the `citizen.unresolvedReportId` fixture, and checks the page rendered before checking that no Case Closure Summary appears. The fixture tickets sit on the routing column 880–1000 m north of the grouping base point, 30 m apart.

`RateLimitService` (`api/src/domain/ratelimit.service.ts`) backstops report submission at **20 per hour per IP** (`IP_HOURLY_BACKSTOP`), and every request in a local run originates from `127.0.0.1`.

Signing up a fresh citizen per test — which the specs already do — resets the per-account limits (5/hour, and 3 within 25 m per 24 hours) but **not** the IP limit. One full run fits inside the budget. A second full run started within the same hour does not.

### Public map and emergency notice checks (step 6a)

No report is posted for any of these:

- `api/src/reports/reports.service.spec.ts` — the public map's exact output columns (no `t.id`, `updated_at`, `assigned_office`), its filters and `ORDER BY t.created_at DESC, random()`, the exact key set of every returned row, keys that are positions and not ids (and change when the same ticket moves position), and `withPublicMapPositionKeys` itself. Putting `t.id` back in the SELECT, or returning the raw rows, fails it.
- `lib/utils/emergency-notice.test.ts` — the notice text, word for word, with no phone number (`node --import tsx --test lib/utils/*.test.ts`).
- `e2e/citizen-map.spec.ts` — the exact key set of every live row, `p1…pn` keys, no tracking reference; the popup's labels are exactly Barangay / Location / Reported, with no "Last update", "Handled by", ticket number or office.
- `e2e/smoke.spec.ts` — the emergency notice on the dashboard and the report form, desktop and phone width, with no dismiss button; the Critical dialog's aligned text.

### Citizen report page checks (step 6b)

Still 15 report posts per full run — every new check reads fixtures:

- `api/src/reports/reports.service.spec.ts` — the citizen history, referral and detail queries pinned exactly as executed (no `admin_name`, `from_status` output, return reason, snapshot, resolver or remarks; the outcome code read only to be mapped); the merge-event `is_merged` rule with the legacy fallback; the acknowledgment choice. Putting `admin_name` back in the history SELECT fails it.
- `api/src/reports/citizen-report-view.spec.ts` — outcome mapping (each outcome, legacy, unresolved), referral agency mapping (suggested list, typed "Other", unrecorded; the list matches `ReferDialog.tsx`), reference format, and no staff-only field in `lib/types/citizens-reports.ts`.
- `api/src/reports/reference-lookup.spec.ts` — the by-reference route: own reference → `{ id }`; another citizen's and a missing reference → the identical 404 from the same query; malformed → the same 404 with no query; the 30-a-minute throttle (429) and its place behind the citizen guard. Answering 403 for another citizen's reference fails it.
- `lib/utils/citizen-report-copy.test.ts`, `lib/utils/tracking-reference.test.ts` — the outcome wording, merged banner and office names; the client-side reference format.
- `e2e/citizen-report-page.spec.ts` (new) — no staff name on any timeline step; referrals with agency and date, never the reason; "Back under review" without the reason or the earlier resolution; outcome wording per outcome and neutral for legacy; the merged banner for the moved report and the survivor's reporter, never the other citizen's reference; the ticket-level acknowledgment; the reference search (own report opens, another citizen's and a missing one say the same "not found", and the API answers both identically).
- `e2e/admin-resolution.spec.ts` (citizen half) — "Back under review" and "Referred to an outside agency", no staff name. `e2e/smoke.spec.ts` — the submit message shows the reference and the office's full name, no ticket number or office code. `e2e/citizen-reports.spec.ts` — the merged banner's new wording.

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
pnpm --prefix api test          # the current Jest suite (46 spec files, §1)
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
- **`e2e/admin-work-orders.spec.ts` has ~10 tests assuming `system_admin` retains operational Work Order access** (view/act on any office's work orders, an office picker on `/admin/work-orders`), a permission model Batch 1 of the five-role architecture removed. This was discovered during Batch 5's live-database integration pass — the file's own shared ticket-borrowing helper crashed first on every run before Batch 5 fixed that helper, which is why these individually-stale assertions were never previously reached or caught. Deliberately **not** mass-edited in Batch 5 (out of proportion for a single regression fix); each needs the same "what does this role model actually allow now" rewrite `e2e/admin-notifications.spec.ts`'s analogous tests already got. Flagged here as a scoped follow-up, not fixed.

---

## 9. Future improvements

Not scheduled. Recorded so the reasoning is not re-derived.

- **Per-run database isolation** — a schema per run, or a transaction rolled back per test. This is the change that would unlock parallel workers and remove most of §8 at once. It is also by far the largest item here, which is why the suite still runs serially. Scoped as a design spike in [`testing-db-isolation-spike.md`](testing-db-isolation-spike.md) (issue #68): four approaches compared against a measured ~37s reference-data seed baseline. Recommendation is database-per-run via a template clone, **CI-only** (local stays on the shared dev DB), sized at roughly 2-4 days — but "not worth building yet," revisited once Playwright-in-CI is actually prioritized. Transaction-rollback-per-test is ruled out for this architecture: the API's separate connection pool (`api/src/db/db.module.ts`) has no mechanism to share a test-driven transaction.
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
