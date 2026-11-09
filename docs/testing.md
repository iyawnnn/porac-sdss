Session account-existence fix (2026-11-09; local verification only): signed admin/citizen sessions now require the account row returned by the existing lookup. Missing rows use the existing generic HTTP 401, with no additional query or new response text. Admin deactivation, account-field checks, valid sessions and the distinct existing admin/citizen session_valid_after timestamp boundaries are preserved. Citizens have no deactivation field.

Regression checks: session-account-existence.spec.ts exercises the real guards over HTTP with signed test tokens; test:session-existence uses the real 0000-0050/PostGIS baseline, drizzle-wrapped postgres.js, actual account deletion in memory and query counting. Both missing-account cases failed before the fix and pass after it. Coverage includes valid staff/citizens, inactive staff, pre/post-revocation tokens, subsecond boundaries and invalid/expired/wrong-audience cookies. Run pnpm --prefix api test:session-existence with PGLITE_MODULE_ROOT set to the same external pinned PGlite installation as test:fresh-database; it loads no env file or real database, and is included in CI.

Local gates: 83 API suites / 1,966 tests and one snapshot; root 44 tests; all 16 PGlite harnesses / 236 groups (11 new session groups); build-recovery and both builds pass. Root type-check/lint and new CJS lint are clean. Broad API type-check matches main's 16 existing diagnostics exactly; API source/test/scripts lint matches main at 550 errors + 7 warnings with no new diagnostic signatures. Builds use env-free temporary copies. Protected hashes match. No real database, migration/seed/archive command, API/web server operation or Playwright run. Owner-reset copy verification and PR CI remain pending; CI will be authoritative.

E2E audit: helpers authenticate existing accounts through login forms and do not forge JWTs or reuse stored deleted-account cookies. globalSetup retires prior throwaway admins before provisioning accounts and before test logins. Retained-cookie checks in admin-management.spec.ts and admin-password.spec.ts expect revocation after edits/password changes, not access after deletion. No helper/setup change is needed. The permission matrix remains deferred until this separate fix PR is merged.

Phase 8c-4 copy verification (2026-11-09, code commit 1d90b1d): ONE full Playwright run with --workers=1 --max-failures=6 passed 307/307, zero failures/skips/flakes/retries, exit 0, 19m 16s. Read-only preflight confirmed ep-noisy-leaf, baseline 239 reports / 215 tickets / 67 Work Orders, zero assessments/fixture audit rows/active fixtures, final 0050 state and 20 available hourly IP slots. Every authenticated warm-up gate returned 200 after a clean .next and fresh API build. Exactly 15 successful submissions and +15 rate events; 6,682 API responses had no retired-field hits. Focal acknowledgment, dashboard counts and citizen timeline checks passed. Terrain exposes only legitimate DEM min/average/max. Teardown left zero active seeded fixture tickets/Work Orders; nine fixture assessments belong to retired tickets, with two remaining on suite-submitted Work Order tickets as in prior runs. All 3,138 original and 32 fixture audit rows are intact; no referenced assessor was deleted. Final catalog and protected hashes match. Task-owned servers stopped; no other process stopped, no production restart and no real migration/archive/manual seed run. The inventory command was not run against any real database. CI remains pending on the PR.

Phase 8c-4 implemented (2026-11-09; local verification only): the owner-operated inventory:test-data utility produces a read-only candidate/dependency review report, with explicit target and date scope, separate production read-only confirmation, PostgreSQL repeatable-read/read-only enforcement and bounded queries. It traces real FKs plus typed audit/notification/history references, preserves ID namespaces, surfaces mixed merge/regroup context and unresolved historical references, and does not promote linked real records to candidates. No apply/delete/reset mode, cleanup executor, schema/auth change or seed-guard change. Private JSON/summary/checksum files stay outside the repo; no credentials, private content or raw audit metadata is exported. Citizens still have no deactivation field and reports have no archive field; any later reversible cleanup requires owner-reviewed IDs, a Neon backup branch and separate approval. See [test-data-inventory.md](test-data-inventory.md).

Verification: 82 API suites / 1,954 tests and one snapshot (35 new inventory unit cases); root 44 tests; all 15 PGlite harnesses / 225 groups passed, including 14 new inventory groups and the 20-group full fresh-database check. The new integration uses real 0000-0050 SQL/PostGIS, drizzle-wrapped postgres.js, actual account/audit services, inventoried-table fingerprints, private artifact checks and an actual CLI child guarded to its exact in-memory socket. PostgreSQL rejects an injected UPDATE inside the reader transaction. Root type-check and both builds pass. Broad API type-check matches current main's 16 existing diagnostics exactly; API lint matches main at 550 errors + 7 warnings with no new findings. Root and new-code lint/format checks are clean. Env-free temporary builds preserve protected hashes and production build output. No real database connection, production dry run, migration/seed/archive command, API/web server operation, Playwright or push. Local commit/review precedes the owner-reset copy/browser gate; CI remains pending.

Phase 8c-3 copy verification (2026-11-09, code commit b4057b3): ONE full Playwright run with --workers=1 --max-failures=6 passed 307/307, zero failures/skips/flakes/retries, exit 0, 19m 01s. Read-only preflight confirmed ep-noisy-leaf, baseline 239 reports / 215 tickets / 67 Work Orders, zero assessments/fixture audit rows/active fixtures, final 0050 state and 20 available hourly IP slots. Every authenticated warm-up gate returned 200 after a clean .next and fresh API build. Exactly 15 successful submissions and +15 rate events; 6,676 API responses had no retired-field hits. Focal acknowledgment, dashboard counts and citizen timeline checks passed. Terrain exposes only legitimate DEM min/average/max. Teardown left zero active seeded fixture tickets/Work Orders; nine fixture assessments belong to retired tickets, with two remaining on suite-submitted Work Order tickets as in prior runs. All 3,138 original and 32 fixture audit rows are intact; no referenced assessor was deleted. Final catalog and protected hashes match. Task-owned servers stopped; no other process stopped, no production restart and no real migration/archive/manual seed run. Neither scenario demo nor bulk ran on Neon. CI remains pending on the PR.

Phase 8c-3 implemented (2026-11-09; local verification only): `pnpm --prefix api test:fresh-database` executes the complete real 0000-0050 SQL history with real PostGIS and all 14 seed/import/cleanup command mappings (12 entrypoints). Actual CLI children run from env-free temporary source copies against memory-only databases, with exact loopback connection guards, no inherited database/mail secrets, local images and disabled live providers. The real GIS importers load 29 barangays, one city polygon and a genuine tiny GeoTIFF's three valid DEM cells. Four demo aliases get independent empty foundations; repeat/refusal, real quota/bulk append, fixture retirement/reseed, referenced assessor retention, FK/unique/JSONB constraints, contracted objects and immutable audit history are asserted. Historical 0007's nonempty-DEM prerequisite and the empty 0050 archive proof are explicit. CI now runs this check after API tests using pinned external PGlite packages; no application dependency or migration SQL changes. The E2E account seed's obsolete truncation warning is corrected.

Verification: 81 API suites / 1,919 tests and one snapshot; 44 root tests; root type-check and both production builds pass. Broad API type-check matches main's 16 existing diagnostics exactly. API lint has 550 errors + 7 warnings versus main's 557 + 7, with no new diagnostic signatures; root source and new CJS lint are clean. All 14 PGlite harnesses pass, 211 groups including 20 fresh-database groups. Builds use an env-free temporary copy. Protected-file hashes match; no real database connection, migration/seed/archive run, API/web server operation, Playwright run or push. PR CI remains pending and will be authoritative. The next gate is owner review, then one full browser run on an owner-reset copy. See [fresh-database-check.md](fresh-database-check.md) for setup, counts, isolation and the fresh-baseline dependency order.

Phase 8c-2 copy verification (2026-11-09, application commit 75a836a): ONE full Playwright run with --workers=1 --max-failures=6 passed 307/307, zero failures/skips/flakes/retries, exit 0, 19m 06s. The hour gate after the previous suite was observed. Copy preflight matched 239 reports / 215 tickets / 67 Work Orders and the final contracted schema; all authenticated warm-up gates returned 200. Exactly 15 successful report submissions and +15 rate-limit events; 6,684 API responses had no retired-field hits (Terrain keeps legitimate DEM min/average/max). Teardown left zero active seeded fixtures; all original audit and 32 fixture audit rows are intact. Nine fixture assessments belong to retired tickets; two remain on suite-submitted Work Order tickets as before. Protected hashes match and task-owned servers stopped. No real migration/archive/manual seed run; neither the scenario demo nor bulk command ran on Neon. An API-only dependency check exposed a test-harness resolver issue hidden by local root dependencies; the follow-up changes only Jest/the timezone probe paths, with application behaviour unchanged. API-only build and all 81 suites / 1,919 tests plus one snapshot pass without root dependencies. PR CI provides authoritative API counts.

Phase 8c-2: pnpm --prefix api test:demo-workflow runs only the injected workflow in memory; it never loads .env or invokes a seed CLI. PGLITE_MODULE_ROOT must point to an external scratch install of @electric-sql/pglite@0.5.15, @electric-sql/pglite-socket@0.2.18 and @electric-sql/pglite-postgis@0.2.15. The real 0000-0050 history runs with real spatial DDL/reference polygons, a tiny DEM sample and the valid empty 0050 archive proof. See [demo-data.md](demo-data.md) for commands, exact scenario coverage and limits; this does not replace the later all-seed CLI/fresh-clone check.

Local gate: API 81 suites / 1,919 tests and one snapshot; root 44 tests; 13 PGlite harnesses / 191 groups all pass (including audit-view's five groups). The 14 workflow groups verify the 15 submissions, 18 m/22 m geography, staff-only merge, all evidence/context states, real lifecycle/audit/notification writes, non-empty/repeat refusal, bulk append and actual quota rejection. demo-evidence.spec.ts uses child processes with confirmed UTC/Manila/New York offsets; a broken-generator mutation fails with an eight-hour shift. Both builds and production type-check pass; broad API type-check remains 16 existing findings versus main 17. API lint: 557 errors + 7 warnings versus main 630 + 7, no new findings; root source lint clean. No real database, live providers/email, migrations/seeds/archive CLI, Playwright or CI run. The demo and a full Playwright suite must never be run within the same hour because both consume the real 20/hour/IP limit.

Phase 8c-1 copy verification (2026-11-09, application commit 5e59235): one full Playwright run with --workers=1 --max-failures=6 passed 307/307, zero failures/skips/flakes/retries, exit 0, 19m 34s. Read-only preflight confirmed ep-noisy-leaf with 239 reports / 215 tickets / 67 Work Orders and final 0050 state; all authenticated warm-up routes returned 200 after clearing .next. Exactly 15 report submissions; 6,683 API responses had no retired-field hits. Terrain exposes only the legitimate DEM min/average/max summary. Teardown left zero active seeded fixture tickets/Work Orders; nine fixture assessments belong to retired tickets, while two assessments remain on suite-submitted Work Order tickets as in the prior clean run. Original and all 32 fixture audit rows are intact; no referenced E2E assessment-creator accounts were deleted. Protected hashes match; task-owned servers stopped. No migration/archive/manual seed run. The known standalone audit-view PGlite expectation remains deferred to 8c-2. CI evidence is recorded on the PR.

Phase 8c-1: all seed/import/fixture-cleanup entrypoints use a seed-only guarded client. The production endpoint prefix ep-steep-mouse is always refused, including with an override. The disposable prefix ep-noisy-leaf, localhost and 127.0.0.1 are allowed. Other single-host PostgreSQL URLs require --i-know-this-is-not-production; this flag is a target assertion, not authorization to run seeds on a real database. No URL is printed by the guard. The presentation demo still requires ALLOW_DEMO_SEED=1 for its destructive reset; workflow/reset changes belong to 8c-2. Migration, archive and verify clients are unchanged.

The admin CLI is now: pnpm --prefix api seed:admin -- <email> <password> <PERSONNEL|SYSTEM_ADMIN> <MEO|MDRRMO|-> <true|false> [firstName] [lastName]. SYSTEM_ADMIN requires - and false; Focal requires PERSONNEL MDRRMO true. Legacy role arguments are rejected. The permanent role mirror is derived from the canonical account fields (ordinary Personnel uses officer).

Offline checks: pnpm --prefix api test --runInBand seed-safety.spec.ts admins.service.spec.ts; set PGLITE_MODULE_ROOT to the existing scratch PGlite/socket project, then node api/test/seed-admin.pglite.cjs. The latter checks the real upsert through drizzle on the actual admin migration history (0000, 0016-0020, 0030, 0039, 0047), with only unrelated CREATE EXTENSION postgis omitted; no hand-written admin tables or constraints. It verifies four valid tuples, repeat/transition behaviour, password hashing, invalid-tuple preservation and unchanged append-only audit. It is not the full 0000-0050 fresh-database check planned for 8c-3. These checks do not load .env or execute a seed CLI.

Phase 8b-2: `node api/test/ticket-acknowledgments-contraction.pglite.cjs` with PGLITE_MODULE_ROOT set to the scratch PGlite/socket installation. No env file or real database client is loaded. Real 0031/0038 history and 0047 audit definitions are replayed. Empty/populated sources, later reports/events/remarks/merges, archive round-trip and count/checksum guards, unexpected catalog/dependency states, unmatched reports, post-FK-drop rollback, final-state reruns and stale-reader/archive-guard mutations are checked. Real Focal intake/dashboard/acknowledge and citizen detail run through a drizzle-wrapped client on both pre-0050 and post-0050 schemas, including first/repeat/concurrent action, later submissions, latest merge, remove/regroup and pre-submission timeline protection. Existing dashboard checks cover per-ticket odd/even median, exact 30-day boundary, null/negative/future exclusions and report paging. PGlite is not a production lock/PostGIS rehearsal. No archive CLI, real migration/seed or Playwright is run for this implementation gate. After review: freshly reset phase2-test, owner-run archive/migration, then one full Playwright suite (rate limits on, standard globalSetup only).

Phase 8b-1: `node api/test/phase8b-contraction.pglite.cjs` with PGLITE_MODULE_ROOT pointing to the existing scratch PGlite/socket installation. No environment file or real database client is loaded. The harness replays real initial/non-spatial migrations (omitting only CREATE EXTENSION postgis), including 0039/0047 audit and 0033/0045/0048 assessments, both empty/populated targets, twice-applied 0049, blocking catalog/dependency states, injected rollback and destructive mutation detection. It compares complete public table data, columns/defaults, constraints, indexes, trigger/function definitions, and exercises real assessment save/export/Work Order/role refusals/account retirement via a drizzle-wrapped socket client on both 0048 and 0049. Geometry in DEM is an explicit text stand-in: PostGIS/production locking still needs a later disposable-copy rehearsal. Keep historical assessment-alignment and export checks. Do not run Playwright or real migrations/seeds for this implementation gate.
Verification (2026-11-08): API 79 suites / 1,851 tests and one snapshot; root 45 tests; PGlite 44 contraction groups, 19 historical alignment groups and 7 export groups passed. Root type-check, API production build and temporary-copy web build passed. Broad API type-check has 17 existing findings versus 19 on main (two touched runner import-extension errors removed), with none new. Root/CJS lint is clean; API source/test lint remains 329 errors + 7 warnings, and including scripts is 676 errors + 7 warnings versus main 684 + 7, with no new findings. The 0039 historical SQL changes are superseded comments only. Protected source files remain unchanged. No real database migration/seed/query or Playwright run; no push.


Verification: 79 API suites / 1,851 tests and one snapshot; 45 root tests; 19 assessment-alignment and seven export PGlite groups; both reason/FK mutations detected; type-check and API/web production builds passed. Root/CJS lint is clean; API lint has no new findings (354 existing versus 356 on the parent). Builds used a temporary source copy, preserving protected files and production API PID 5176. No Playwright or real-database migration/seed run.

Phase 8a assessment alignment: run api/test/assessment-alignment.pglite.cjs with PGLITE_MODULE_ROOT pointing to the existing scratch PGlite/socket installation. It builds the real 0033/0045 baseline in memory, checks populated conversion twice, all blocking preflights, rollback, mutation detection, and real service/Work Order/export/cleanup paths through a drizzle()-wrapped postgres client. No env file or real database is loaded. The updated new-exports.pglite.cjs uses the final shape. Migration order is 0033 -> 0045 -> 0048; the old 0045 runner verifies final state without recreating retired columns. E2E setup retires referenced assessment creators; audit history and actor_role remain untouched. Do not run Playwright or live migration/seed runners during this implementation gate.

# Testing

### Phase 7, step 7d-2: Focal intake aggregation and dashboard cleanup

Focal remains central, municipality-wide report intake. The four existing cards retain their report units and intake-state rules; their SQL aggregates exclude reports on merged-away tickets. "New Reports" retains its existing all-time total meaning. Screening remains independent of acknowledgment, and the later screening/history event determines the intake state (routing wins a tie). The median now uses ticket acknowledgments minus ticket creation, once per ticket, excluding negative/null intervals, with percentile_cont(0.5) over acknowledgments in the inclusive last-30-day window through now. Null displays as "No data yet" via metricDuration. No Work Order data or authority is added. The dedicated Intake Queue and Web-GIS Map keep their existing endpoints and behavior. Operational Personnel remain restricted to their own office.

**Dashboard transport / response fields:**

- The Focal dashboard stops fetching the full GET /admin/intake array. That endpoint and its existing FocalIntakeRow response remain unchanged for the dedicated queue.
- New GET /admin/focal-dashboard returns exactly `{ newReports, unacknowledged, needsScreening, forwardedOrEscalated, medianAcknowledgmentHours30d }`; the first four are integer report counts and the last is nullable hours.
- New GET /admin/focal-dashboard/reports?page=1&pageSize=6 returns `{ items, total, page, pageSize }`. Defaults are 1/6; maximum pageSize is 50 and maximum page is 1,000,000. Invalid, non-integer or oversized values return 400. SQL orders by submitted_at DESC, report_id DESC, including JSON aggregation order. One SQL statement returns the count and page under the same snapshot; an empty/out-of-range page retains the total.
- Each dashboard item has exactly `{ reportId, reportReference, category, barangayName, routedOffice, operationalPriority, submittedAt, intakeState, needsScreening }`. Compared with the full intake DTO formerly transported to this dashboard, it omits unused ticketId, ticketReference, ticketStatus, memberCount, citizenSeverity, flags, acknowledgedAt and acknowledgedByName. Both new endpoints require AdminSessionGuard and FocalGuard, with a service-level Focal check too.
- GET /admin/dashboard removes leaderboard and departmentWorkload; officePerformanceSummary removes byOffice and narrows scope to MEO or MDRRMO. Other fields retain their shapes.

**Deletion search evidence (searched before deleting):** `rg -n` over api/src, api/test, api/scripts, app, components, lib and e2e found the following consumers. No external runtime consumers were found.

| Item | Search result and deletion |
| --- | --- |
| departmentWorkload / getDepartmentWorkload | Dashboard controller/service, app/admin/page.tsx response interface and DashboardClient only. Removed query, response field, chart config/order and card; DepartmentWorkloadComparison had only DashboardClient as a consumer, so its file was deleted. |
| byOffice | Dashboard controller/service/interface, root type, OfficePerformanceSummary comparison table and dashboard service spec. Removed comparison assembly/UI/type and system-admin test with its ALL fixture. The identically named local variable in seed-demo-presentation.ts is unrelated and remains untouched. |
| City-wide dashboard summary | OfficePerformanceSummary's ALL label branch and the controller's undefined-office comparison branch; both unreachable under OperationalStaffGuard. Removed these and the ALL type case. DashboardClient/MapPresets had the only dashboard system-admin preset branch; its sole call site was confirmed before removing that branch and props. ReportsWorkspace's separate City-wide summary label remains untouched. |
| leaderboard / getBarangayRiskRanking / BarangayRiskRow | Dashboard service/controller, root response interfaces/types and an E2E response assertion. Removed the unused query and types, then replaced the old E2E assertion with absence checks. No separate leaderboard/workload fixture files existed. |

The merged-away source scan now expects 13 dashboard exclusions rather than 15 because the two deleted queries each contained one. Final search leaves only E2E absence assertions plus the unrelated seed variable and Reports label above. Historical audit/notification values are untouched; ticket_critical remains renderable as "Ticket Urgency Became High (retired)" but is absent from the filter options. The Barangay index has no elevation value; its existing guidance now points to "Terrain (informational)" in each profile, whose elevation card carries that exact label. No elevation calculation, field or query changes.

**Verification:** 79 API suites / **1,850 tests** and one snapshot passed; **38 root unit tests** passed. API build, root type-check and production web build passed. New Focal service spec has 16 tests. Six new Focal PGlite groups plus six existing dashboard metric groups passed through drizzle()-wrapped postgres clients in disposable memory databases; no env file or live database was loaded. The Focal harness checks empty/null/zero behavior, both-office aggregation, merged exclusion, odd/even medians, exact 30-day/future boundaries, deterministic ties and disjoint pages, totals beyond the end, report-state reconciliation and exact response keys. It first runs without a Work Order table, then inserts 100 unrelated Work Orders and proves the output is unchanged. Raw SQL debug checks reject JS Date parameters.

Three mutations were detected: removing the Focal merged-away predicate changed counts and median; adding Work Order data to Focal counts failed the no-Work-Order-table test; removing operational office scope failed the existing MEO aggregate assertion. Sources were restored byte-for-byte after each mutation and both final harnesses passed. The initial API runs caught two obsolete assertions (browser-side screening counting and the old 15-query-exclusion total); both were updated to the new contract before the passing final suite.

Web/E2E lint and lint for all new API files and touched production API files passed. Touched legacy specs retain **38 pre-existing lint errors** (dashboard.service.spec.ts: 30 versus main's 33; focal-intake.service.spec.ts: 8, unchanged), with no new findings. The first new-spec lint run found two unsafe mock index accesses; typed call tuples fixed them. The harness is ignored by root ESLint, so its executed checks provide verification. Root pnpm emitted a non-fatal update-check network warning; the temporary build initially attempted dependency auto-install, then lacked the shared audit contract. Dependency auto-install was disabled and the existing contract copied into the temporary source tree; a sandbox directory-access failure was resolved with the build's normal escalation. The final pnpm build passed using linked dependencies and a widened Turbopack root only in the temporary copy, preserving source next-env.d.ts and the workspace .next.

**Files changed (29):**

- API: api/src/admin/admin.module.ts; dashboard.controller.ts; dashboard.service.ts; dashboard.service.spec.ts; focal-dashboard.controller.ts; focal-dashboard.service.ts; focal-dashboard.service.spec.ts; focal-intake.service.spec.ts; merged-away.spec.ts; api/test/focal-dashboard.pglite.cjs.
- Pages: app/admin/page.tsx; app/admin/focal/page.tsx.
- Components: components/features/admin/barangay-insights/BarangayInsightsWorkspace.tsx; BarangayProfile.tsx; components/features/admin/dashboard/DashboardClient.tsx; DepartmentWorkloadComparison.tsx (deleted); MapPresets.tsx; OfficePerformanceSummary.tsx; components/features/admin/focal/FocalDashboard.tsx.
- Types/unit test: lib/types/admin-dashboard.ts; admin-focal-dashboard.ts; admin-notifications.ts; lib/utils/admin-notification-types.test.ts.
- Browser specs: e2e/admin-dashboard.spec.ts; admin-focal.spec.ts; admin-notifications.spec.ts; admin-barangay-insights.spec.ts.
- Documentation: docs/project-status.md; docs/testing.md.

**Playwright is updated but has not been run.** Stop after commit for review. Only after review and a fresh Neon reset of phase2-test may the single full suite run: preflight must show 239 reports, 215 tickets, 67 Work Orders and zero audit rows with target_id >= 1e9. The 114 "E2E" reports and 615 e2e- accounts are baseline. Rate limits stay enabled; a full run makes about 15 real report submissions against the 20/hour/IP backstop. No migration, live seed, database reset, audit cleanup or push was performed in this implementation step.

### Phase 7, step 7d-1 dashboard metric verification

Dashboard metric shaping and duration tests cover explicit zero/null behavior, citizen-style outcome/state wording and hours/days rounding. api/test/dashboard-metrics.pglite.cjs runs real DashboardService, BarangayInsightsService and related dashboard read queries in isolated in-memory PGlite through a drizzle-wrapped postgres client. It never reads .env or connects to the development/production database; text geometry equality/containment stand in for PostGIS. Cases cover both offices, merged-away and Rejected rules, status/outcome/acknowledgment/hazard buckets, empty data, even/odd medians versus means, exact 30-day and future boundaries, current/context/location hazard selection, existing report/Work Order counts, and the insert-only metric fixture helper.

The dashboard and Barangay Insights Playwright specs gain zero-citizen-POST coverage for both offices, panel/advisory labels, status-count reconciliation, category/total exclusions and Focal/System Administrator refusals. They are extended but deliberately NOT run in this implementation step.

**Fixture lessons:** non-Reported ticket fixtures must insert status_history or dashboard trends disagree with headlines. New Resolved fixtures need resolved_at, outcome, resolver and notes plus matching history (an explicitly designated legacy fixture alone may omit the record). Acknowledged fixtures need ticket-level acknowledgments rows; report acknowledgments alone do not qualify. The E2E dashboard metrics prefix joins both active and Resolved retirement lists. Teardown changes status and clears resolution fields atomically; audit rows remain append-only. No live seeds, migrations or audit cleanup are run here.


7d-1 verification: **78 API suites / 1,835 tests**, API build, root type-check, **37 root unit tests**, production web build and web/E2E/harness lint passed. **6 dashboard PGlite groups** and **7 existing new-export/fixture-history regression groups** passed. Mutations adding Rejected to the Barangay total, dropping a metric's merged-away filter and replacing the resolution median with AVG each failed the real-query harness as expected; every source was restored byte-for-byte and the final harness passed. The first API run caught the old source scan's pinned count of eight merged exclusions; it now pins fifteen, with the real-query harness covering semantics. The root-unit command initially used the API tsconfig and could not resolve a root alias; running from root passed. These were corrected verification assumptions, not main failures.

API lint on touched files retains **44 existing findings**: 11 unsafe-mock findings in barangay-insights.service.spec.ts and 33 unsafe-mock/unbound-method findings in dashboard.service.spec.ts, identical by rule to main. No new findings; existing formatting findings in touched services/specs were corrected. The production web build uses pnpm build in a temporary working-source copy with linked dependencies (only that copy's Turbopack root widened), preserving protected next-env.d.ts and the pre-existing workspace .next. No schema/index, database.md or security.md change: access and exposure are unchanged. No real database, migration, seed runner, Playwright or push.

### Phase 7, step 7c-2 additional exports

`report-exports.spec.ts` pins the three column lists, submitted forbidden-data boundary, assessment text and manuscript labels, heavy-export 5,000/5,001 boundaries, strict Top N/filter/date validation, safe audit metadata and fail-closed errors. Controller tests cover attachment refusal for all six endpoints. The audit allow-list snapshot includes the three new kinds and top; the central-writer source scan remains unchanged.

`api/test/new-exports.pglite.cjs` loads the real new query/service source and uses a postgres client wrapped by drizzle. It checks both office directions, merged-away exclusion, single-assessment uniqueness, four Work Order status counts, unassessed exclusion, exact Manila midnight/microsecond boundaries, active-only priority order and id ties, Top N, current-location hazard summary, overflow refusal and audit actor_is_focal snapshots. It also executes the insert-only new E2E fixture helper. No env file, real database, migration or seed runner is loaded; only geometry equality has a text stand-in, so this verifies export SQL rather than PostGIS itself. Use the existing PGLITE_MODULE_ROOT scratch installation.

`e2e/admin-reports.spec.ts` adds downloads of all three files for both offices, fixture text/reference/privacy checks, Top N 1/2 and invalid inline errors, closed/merged exclusion, audit kind/details and all-six-endpoint Focal/MIS refusal. It posts no citizen reports. Fixtures use a distinctive E2E reporting fixture prefix and join existing active/Resolved retirement, which clears resolution fields in the same status UPDATE; audit rows remain append-only and assertions avoid audit totals. The CSV reader handles quoted commas/newlines. No React component renderer exists here; existing download-helper unit tests cover the inline-error source and E2E pins Top N bounds. Playwright is intentionally not run in this implementation step.

7c-2 verification: API **77 suites / 1,833 tests passed**; API build, root type-check, **36 root unit tests**, and production web build passed. PGlite: **6 new-export groups + 7 existing-export regression groups passed**. Removing office scope, removing merged-away exclusion, and reversing priority order each failed a real-query PGlite assertion; adding a citizen column failed two unit tests. Every mutation restored the original source bytes and final checks passed. The original three CSV methods and date parser match main unchanged; the writer, shared limit, schema and database documentation have no diff. Web/E2E and harness lint passed; touched API files retain only the same **5 existing unbound-method errors** in reports.service.spec.ts as main, with no new findings. The web build ran via pnpm build in a temporary source copy (only its Turbopack root widened for linked dependencies; pnpm dependency auto-install disabled), preserving the existing workspace .next and protected files. No Playwright, migration or live-database seed runner was run.

### Phase 7, step 7c-1 export hardening

API tests pin all three 5,000/5,001 boundaries, cancellation columns and blank values, flagged column list and tracking-reference privacy, required safe audit details, fail-closed attachment behavior, guards and merged-away exclusion. Root `download-export.test.ts` covers credentialed fetch, server refusal text and server filename/file bytes. `api/test/exports.pglite.cjs` runs real export queries plus required audit inserts through a `drizzle(postgresClient)` wrapper in a disposable memory database, without env files or database runners. Geometry equality has a text stand-in against an empty hazard table; this checks export SQL, not PostGIS. Run after API build with `PGLITE_MODULE_ROOT` pointing to the scratch PGlite/socket installation.

`e2e/admin-reports.spec.ts` adds actual flagged downloads for both offices, opposite-office clamping, tracking-reference/no-name/no-title assertions, cancellation headers, Report export Activity Log details and Focal/MIS refusal. Export fixture helper only inserts tickets/reports; they and audit history accumulate. No citizen-report POSTs. Playwright is deliberately not run in this implementation step.

Verification: 76 API suites / 1,796 tests passed; API build, root type-check, 36 root unit tests and production web build passed. Seven export PGlite groups passed (including the insert-only fixture writer). Mutations: adding citizen name failed 2 tests, removing the limit failed 3, and removing the audit write failed 7; original bytes restored, followed by 255 focused passing tests. Web/E2E/helper and harness lint passed. API lint retains five pre-existing unbound-method findings in reports.service.spec.ts; the same main file has 28 findings including those five. No new lint findings. The web build used pnpm build in a temporary source copy, with only that copy's Turbopack root widened for linked dependencies and pnpm automatic dependency installation disabled; source next-env.d.ts and the pre-existing .next remained untouched. The CSV source scan still rejects alternate writers and browser-built CSV; its service check now pins central serialization before awaited audit and return of the serialized result.

**How to verify changes to PORAC-SDSS, and the caveats that make this suite different from most.**

**7c-1 full Playwright run (2026-11-06, before the follow-up fixes):** one complete Chromium run with `--workers=1`: **292 passed, 4 failed, 0 skipped, 0 flaky** in 20m48s. `admin-reports.spec.ts`: **23 passed, 3 failed**. The persistent report-submission counter increased by exactly **15**. Read-only preflight matched the disposable copy baseline (239 reports / 215 tickets / 67 Work Orders), no audit target ids >= 1 billion, no active setup fixture tickets, and enabled 0047 audit protection. Baseline titles containing E2E are not a cleanliness test.

Failures and follow-up: the Activity Log date test expected 30 events instead of the exhaustive action list's new 31; both flagged download tests passed download/privacy/tracking-reference/office-scope assertions, then retained their operational cookie when attempting MIS login (307 back to the staff dashboard, not a cold-server timing flake); an older Work Order test still expected the 12-column header instead of 15. Fix the fixture count from `AUDIT_ACTIONS.length`, clear the browser context's cookies before the explicit MIS sign-in, and update the old header expectation. No application, shared login-helper or timeout change. The new cancellation-header/notes checks and Focal/System Administrator export refusals passed; the two new Activity Log detail assertions were not reached and still need a fresh-copy rerun.

Follow-up verification: touched E2E specs and fixture setup pass lint; root type-check and the one final `pnpm build` pass. The build ran in a temporary source copy to preserve protected generated files. No second Playwright run, migration, manual seed or audit cleanup was performed.

Post-run checks found two active export fixture tickets missing from the existing retirement prefix list; that prefix is now included for future global setup/teardown. The dirty copy was not cleaned or rerun; all 32 high-id audit fixture rows remain append-only. Reset phase2-test before another Playwright run. The API ran from an empty scratch directory with inherited settings excluding RESEND_API_KEY, disabled hazard/rainfall lookups, a logged console-mailer confirmation, and no ECONNRESET. API health/dashboard and web login warm-up returned 200. Only owned servers were stopped; ports 3000/3001 were verified free and protected file hashes were unchanged. Temporary PowerShell log-sharing/native-stderr handling needed correction/report recovery; the complete JSON report contains all 296 results and no global errors.

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
| `report_exported` | `kind`, `rowCount`, `office`, `status`, `category` (short code), `barangayId`, `categoryReview`, `overdue`, `flag`, `dateFrom`, `dateTo`, `searchApplied`, `assigneeFiltered`, `selectionCount` |
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
| `cleanup:e2e-admins` | Retires referenced assessment creators and deletes only unreferenced throwaway accounts from earlier runs |
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
