# Seed scenario demo

The presentation demo makes exactly 15 submissions through ReportsService.submit, with the real RateLimitService (5/account/hour, 20/IP/hour, and the spatial control). It then calls the real Focal, ticket, grouping, assessment, Work Order, feedback, notification and audit services. There are no raw report/ticket/history/audit fixture inserts, automatic merges, backdated timestamps, rate-limit bypasses or destructive resets.

Only external boundaries are local: image storage writes generated JPEGs to public/uploads/reports; email uses ConsoleEmailService explicitly; hazard and rainfall providers return scripted results. Automatic hazard scheduling is suppressed so a pending example stays pending. Explicit lookup/refresh calls still use the real persistence and constraint checks. No Cloudinary upload, Resend email, weather request or GIS-provider request is made.

## Prerequisites and commands

Owner-operated disposable targets only. The shared seed guard always rejects production. A fresh operational target must have the final schema through 0050, barangay/city geometry, and the demo staff/citizen accounts. The demo itself does not run migrations, import reference data, create accounts, or read an archive. It refuses existing reports, tickets, Work Orders, assessments, notifications, audit history or submission events from the preceding 24 hours before creating media or operational records. Run one seed command at a time.

The current account prerequisites are five citizens from seed:users and active MEO Personnel, MDRRMO Personnel and MDRRMO Focal Personnel from the canonical admin CLI or seed:e2e-admins. seed:users is data-only: it no longer adds the unused citizens.verified column.

- pnpm --prefix api seed:demo-presentation ? one 15-submission scenario demo.
- seed:diverse-reports, seed:mock-report and db:seed are compatibility aliases for that same demo, with the same empty-target refusal.
- pnpm --prefix api seed:bulk-reports -- --count 3 ? optional volume-only data on an empty operational target.
- pnpm --prefix api seed:bulk-reports -- --append --count 3 ? explicit additive volume on an existing disposable dataset, subject to current real quota. Existing records are never replaced. A repeated bulk batch refuses its marker titles. Count is 1?15; default 3. The initial 15-report demo leaves at most five IP slots, so a larger immediate batch is refused before writing.

**Do not run the demo seed and a full Playwright suite within the same hour.** Both consume the real 20-per-hour/IP submission budget; the suite alone makes 15 submissions. Bulk also consumes that budget. Wait at least an hour after the latest submissions before another large run. A concurrent writer or mid-run failure can leave partial data; it is retained, and another demo invocation refuses it. Review/reset the disposable target rather than deleting rate events or audit history.

## Submission coverage

All 15 submissions get a database-generated tracking reference, Focal severity screening, a ticket-level acknowledgment and real receipt/intake notifications. Flagged evidence remains accepted.

| No. | Scenario key | Additional coverage |
| --- | --- | --- |
| 1 | municipal-completion-confirm | Pothole anchor; survives staff merge; assessment, completed Work Order, municipal resolution; first citizen confirms |
| 2 | suggestion-18m-staff-merge-dispute | Same-category report 18 m north; initially separate; staff merge only after querying suggestions; second citizen disputes the survivor |
| 3 | outside-suggestion-22m | Pothole 22 m south; absent from the anchor's suggestions; remains separate |
| 4 | three-day-pothole-40m-no-flag | Three-day pothole photo and 40 m GPS difference: no stale or mismatch flag |
| 5 | location-mismatch-60m | Accepted LOCATION_MISMATCH evidence |
| 6 | flood-27h-classified-zero-rain | Accepted STALE_EVIDENCE; classified hazard; CURRENT rainfall of 0 mm |
| 7 | missing-capture-time | Accepted MISSING_METADATA |
| 8 | future-flood-no-classification-rain-unavailable | Accepted TIMESTAMP_ANOMALY; no hazard classification; UNAVAILABLE rainfall with null value |
| 9 | no-gps-hazard-unavailable | Usable time without GPS: no mismatch judgment; hazard temporarily unavailable |
| 10 | hazard-pending | Applicable landslide category with no completed lookup (pending) |
| 11 | cancelled-work-order | Assessment before Work Order; cancellation with a recorded reason |
| 12 | pending-work-order | MEO assessment and pending Work Order |
| 13 | in-progress-work-order | MDRRMO assessment and in-progress Work Order |
| 14 | external-referral-resolution | Focal referral to DENR-MGB with reason; MDRRMO review; EXTERNAL_REFERRAL resolution |
| 15 | focal-and-operational-routing | Focal reassigns to MDRRMO with reason; MDRRMO reviews/reassigns to MEO with reason; MEO records a DPWH referral with reason |

## Suggestion-distance evidence and unresolved source references

The executable Pothole mapping is exactly 20 m (api/src/common/utils/radius.ts). The demo regression uses real PostGIS geography, confirms an 18 m candidate and excludes the 22 m ticket before the staff merge. Its manifest emits ?Possibly related to Ticket #..., 18 m away?. Existing UI wording is a ?Possibly related tickets? heading plus ?Ticket #... ? 18 m away?; no UI copy was changed.

The radius source comment and docs/features.md ?4.3 cite manuscript pages 31 and 78 and Phase 3 step 3c; RelatedTicketsService also cites handoff Decision 1. These are repository claims, not independently verified manuscript/table evidence. The primary manuscript was not available locally, and the handoff URL could not be accessed. No specific table/line basis can therefore be certified. No radius or fallback was changed in this step. The following mappings remain for the owner's source-backed decision rather than being silently endorsed:

| Current radius | Categories requiring primary-source confirmation |
| --- | --- |
| 20 m | Streetlight Out; Damaged Manhole Cover (Pothole's runtime 20 m behaviour is verified separately above) |
| 50 m | Clogged Drainage / Damaged Culvert; Uneven Sidewalk; Fallen Tree or Storm-Related Road Obstruction; Overgrown Vegetation Obstructing Road or Signage; Illegal Dumping Affecting Drainage or Road; Leaking Pipe / Water Supply Concern; Other Minor Infrastructure Hazard |
| 100 m | Localized Flooding; Rain-Induced Slope Failure/Landslide; Lahar or Volcanic Debris-Flow Threat |

Legacy aliases retain their current values too: Pothole is 20 m. Flooding, Landslide / Slope Failure, and Lahar / Debris-Flow Threat are 100 m. Clogged Drain, Fallen Tree, Leaking Pipe, Illegal Dumping, Overgrown Vegetation, Other, Uncollected Garbage, Drainage / Culvert / Manhole Issue, and Fallen Tree / Storm-Related Obstruction are 50 m. Unknown-category fallback remains 50. These alias/fallback choices also require source confirmation. Any conflict with a universal manuscript 20 m rule needs an owner decision in a separate change.

## Offline regression

Install the compatible test-only packages outside the repository: @electric-sql/pglite@0.5.15, @electric-sql/pglite-socket@0.2.18 and @electric-sql/pglite-postgis@0.2.15. Set PGLITE_MODULE_ROOT to that scratch package directory, then run pnpm --prefix api test:demo-workflow. No env file is loaded and no seed CLI is invoked.

The harness uses drizzle(postgresClient), all real historical SQL through 0050, real PostGIS, the real spatial reference DDL extracted from its existing seed sources, tracked barangay/city polygons and a tiny DEM sample. Historical 0007 requires at least one DEM value before it calculates its NOT NULL config bounds. Empty 0050 uses a valid zero-row/empty-byte archive digest through the real guard. No real migration/archive runner is invoked. This is workflow regression infrastructure; the broader actual-CLI check is `pnpm --prefix api test:fresh-database`, documented in [fresh-database-check.md](fresh-database-check.md). That check executes every seed/import/cleanup CLI against its own in-memory database with no env file.

It checks the scenario map, separate pre-merge submissions, quotas, refused non-empty/repeat runs, bulk append safety, assessment ordering, JSONB/FK constraints, both feedback answers, notifications, immutable audit and zero live fetches. Unit tests round-trip actual generated EXIF in child processes with UTC, Asia/Manila and America/New_York and cover all evidence cases, including unusable capture time.

The audit-view regression now derives counts from AUDIT_ACTIONS: 31 action types plus a second-day admin_login means 32 fixture rows (31 on day one, one on day two). report_exported was added in commit ed2bc77 (Phase 7c-1). insertAuditViewFixtures creates its row through the all-actions loop, called by api/test/audit-view.pglite.cjs's fixture/date-boundary check. The test explicitly requires one report_exported, two admin_login events and every current action; no production audit rows or historical values are changed.
