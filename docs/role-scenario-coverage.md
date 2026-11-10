# Phase 8d-2 acceptance coverage

The table maps the approved acceptance rows to executable checks. Existing checks
are reused; the new role harness fills workflow gaps rather than replacing the
94-route permission matrix. Product permissions, including eligible Focal grouping,
are unchanged. An admission probe in the permission matrix proves access only;
the workflow checks below execute handlers or services.

Run `pnpm --prefix api test:role-scenarios` with `PGLITE_MODULE_ROOT` set to the
external pinned PGlite/PostGIS installation described in testing.md. It creates
only an in-memory database using the real 0000–0050 SQL, a drizzle-wrapped client,
and the real AppModule. It uses signed sessions and actual HTTP controllers. It
cannot read env files or connect to an external database/provider. Its ephemeral
loopback listeners close in `finally`; no server on 3000/3001 is needed.

All new refused writes compare fingerprints of every public application table,
including audit/history. Fixtures may use SQL to establish starting state; workflow
actions execute production handlers. Every new HTTP response is recursively checked
for retired field names. This key scan does not claim to inspect pages or CSV.

| Acceptance row | Executable coverage |
| --- | --- |
| P1: 3.5-day age factor 0.5 | role-scenarios: P1/P4 age check; scoring.spec.ts exact clock cases |
| P1: retired values absent from API, pages, CSV, notifications | role response key scan; reports/reports.service.spec.ts privacy guard; report-exports.spec.ts column/privacy tests; citizen-report-page.spec.ts and notification tests; copy-run response scan |
| P2: all six identities, Focal cannot open Work Orders | permission-matrix.pglite.cjs: 564 route cells plus actual Work Order refusals |
| P3: 18 m suggestion, 22 m exclusion, no automatic merge | demo-workflow.pglite.cjs: real submissions/PostGIS and explicit staff merge; exact suggestion text; Pothole radius 20 m |
| P3: B merges into A, leaves queues, retains history/reference, membership/priority change | role-scenarios: cross-office merge workflow; permission matrix merged-away map exclusion; ticket-acknowledgments-contraction.pglite.cjs timeline cases |
| P3: cross-office merge refused until reassignment | role-scenarios: unchanged refusal followed by real reassign and merge |
| P3: evidence mismatch, stale flood, old pothole, missing metadata and future time | domain/demo-evidence.spec.ts production evidence/parser cases including timezone probes; demo-workflow.pglite.cjs four persisted flag states |
| P4: Low/High/Critical and Medium/Critical medians both 0.75 | role-scenarios: both real priority-context HTTP checks |
| P4: unreachable hazard source does not block handling | hazard-information.service.spec.ts network failure/nonblocking checks; demo-workflow.pglite.cjs unavailable state plus continued workflow |
| P4: flood outside mapped polygons has no classification, never safe/Low | hazard-information.service.spec.ts empty-features result; common/utils/hazard-information.spec.ts exact labels; demo workflow persisted NO_CLASSIFICATION |
| P4: rainfall zero versus failed fetch | rainfall-context.service.spec.ts zero/current and failure checks; common/utils/rainfall-context.spec.ts labels; demo workflow CURRENT 0 versus UNAVAILABLE null |
| P5: no assessment refuses Work Order | role-scenarios: unchanged refusal then assessment/creation succeeds |
| P5: cancellation needs reason | role-scenarios unchanged refusal; demo workflow successful reasoned cancellation |
| P5: Completed Work Order cannot reopen | role-scenarios real lifecycle and unchanged refusal |
| P5: reassignment needs reason | role-scenarios unchanged refusal |
| P5: Focal Reassign/Refer in Under Review refused | role-scenarios both actual intake handlers return 403 with no changes |
| P5: External Referral resolution then return to review; both history entries | role-scenarios real referral, resolution and return; SQL checks outcome and reason snapshots |
| P6: two citizens on one ticket independently confirm/dispute | permission-matrix.pglite.cjs real feedback writes; citizen-resolution-feedback.spec.ts browser flow |
| P6: public map privacy for another citizen | permission-matrix.pglite.cjs exact key allowlist, rounded coordinates, null foreign own_report_id |
| P6: emergency guidance and Critical confirmation | e2e/smoke.spec.ts emergency desktop/phone test and Critical cancel/confirm/reselect test; no extra real submission |
| P7: create/edit staff, invalid field combinations, MDRRMO-only Focal | role-scenarios actual admin handlers, invalid combinations unchanged, MEO to MDRRMO/Focal transition |
| P7: office change logs out once | role-scenarios old signed cookie rejected; identical edit preserves session_valid_after |
| P7: deactivate/reactivate | role-scenarios persisted state and real audit actions; session-existence.pglite.cjs inactive-session refusal |
| P7: self-edit blocked, last active System Admin protected | role-scenarios unchanged 403 edit/409 deactivation; admins.service.spec.ts demotion/last-admin cases |
| P7: actor account type/Focal flag visible, append-only audit | audit-view.pglite.cjs projection/filter tests; role-scenarios real staff audit inserts and trigger rejection; permission matrix historical audit preservation |
| P7: export cap 5,000 and audit | exports.pglite.cjs all three 5,000/5,001 boundaries and real audited queries; report-exports.spec.ts bounded inputs/CSV assertions |

API unit tests, permission matrix, role scenarios and the existing demo workflow
run in CI. Other PGlite harnesses run in the full local gate. The one full copy
Playwright run remains a separate owner-reset gate; it makes exactly 15 citizen
submissions with rate limits enabled. Do not run another full suite or the demo
within the same hour.

Provider network transport is simulated in memory: these tests do not verify live
DENR-MGB/OpenWeather availability, deliver email, or exercise production. Terrain
minimum/average/maximum from dem_points remain legitimate and are not retired
per-report elevation fields. No migration, seed or archive command is required.
