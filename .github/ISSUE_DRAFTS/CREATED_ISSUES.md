# Created GitHub Issues Tracker

Manual tracker for PORAC-SDSS GitHub issues already created from `.github/ISSUE_DRAFTS/`.

Last updated: 2026-08-27 (backlog audit — see "Pending manual close" section below; the "Created issues" table's own `Notes` column was last hand-verified 2026-08-13 and is **not** a live `gh issue list` snapshot).

Summary: **28 seeded issues total** · **13 verified implemented, pending manual close** · **15 verified still open or blocked** · **6 closed duplicate issues (historical)** · **6 new drafts (035–040) prepared, not yet created**

**Important:** this file is a manually-maintained local tracker, not a live sync of GitHub. The 2026-08-27 audit did not run `gh issue list` (by instruction) — it verified completion against `docs/project-status.md` §3 and the actual current code, cross-referenced against the `Active` rows already in this file as of 2026-08-13. Before closing anything, run `gh issue list --state open` yourself to confirm these issue numbers and states still match GitHub's actual current state.

## Pending manual close (verified implemented, 2026-08-27 audit)

These 13 are **not yet closed on GitHub** — that is a manual action the repo owner takes from their own authenticated account. Do not treat the `Created issues` table below as reflecting reality for these 13 until that close actually happens; their `Notes` column still reads `Active` there deliberately, since this file must not claim a GitHub state that hasn't occurred yet.

| Draft # | GitHub Issue | Title | Evidence of completion |
| --- | --- | --- | --- |
| 001 | #42 | Add failed-login throttling for admin login | `docs/project-status.md` §3 "Failed-Login Throttling for Admin Login (R1) — completed" |
| 002 | #43 | Add baseline HTTP security response headers | §3 "Baseline HTTP Security Response Headers (R2) — completed" |
| 003 | #48 | Add max length bounds for free-text fields | §3 "Free-Text Length Bounds (R3) — completed" |
| 004 | #49 | Add login audit events | §3 "Admin Login Audit Events (R4) — completed" |
| 007 | #50 | Add security tests for office-scoped CSV exports | §3 "CSV Export Office-Scoping and Note-Leak Regression Tests — completed" |
| 008 | #51 | Close remaining gaps in work-order office-scoping tests | §3 "Work-Order Office-Scoping Test Gaps Closed — completed" |
| 009 | #52 | Add security tests for ticket reassignment behavior | §3 "Ticket Reassignment Security Tests Added — completed" |
| 010 | #53 | Add citizen cross-account report access regression test | §3 "Citizen Cross-Account Report Access Regression Test (R8) — completed" |
| 011 | #44 | Add root and admin SSR/API error boundaries | §3 "Root and Admin SSR/API Error Boundaries (R10) — completed" |
| 014 | #65 | Improve Resend/email failure visibility in development | §3 entry titled "...(GitHub #65) — completed" (self-referential) |
| 015 | #66 | Add clearer API startup validation messages | §3 entry titled "...(GitHub #66) — completed" (self-referential) |
| 016 | #46 | Reduce report creation in admin-tickets.spec.ts | §4.3 "Wider fixture sharing — done for the read-only slice"; `docs/testing.md` §6 report-count table updated |
| 017 | #67 | Document and standardize the shared-fixture strategy | Confirmed directly in `docs/testing.md` §5 (decision-rule table present at the documented location) and §10 (checklist reminder present) |

**Recommended close command** (repo owner runs manually, from their own `gh auth status` account):

```powershell
gh issue close 42 43 44 46 48 49 50 51 52 53 65 66 67 --reason completed --comment "Verified shipped against docs/project-status.md §3 — see PORAC-SDSS backlog audit 2026-08-27."
```

**After running that**, update the 13 rows in the `Created issues` table below: change `Notes` from `Active` to `Closed — completed (2026-08-27 audit)` and adjust this file's summary line accordingly. Do not make that edit before the `gh issue close` has actually run.

## Still open or blocked (not touched by this audit's close recommendation)

| Draft # | GitHub Issue | Title | Category |
| --- | --- | --- | --- |
| 005 | #62 | Add Content-Security-Policy in Report-Only mode | Still valid — now unblocked (002 shipped) |
| 006 | #63 | Review trust proxy behavior before deployment | Blocked — hosting decision |
| 012 | #45 | Fix citizen error boundaries to use the recovering retry prop | Still valid, not done |
| 013 | #64 | Add a better fallback UI when the API is unavailable | Still valid, waiting on 012 |
| 018 | #68 | Plan per-run test database isolation | Still valid, not done (spike) |
| 019 | #69 | Add Playwright to CI | Blocked by 018 |
| 020 | #70 | Add a CI job summary for build and test results | Still valid, not done |
| 021 | #71 | Add a lint/typecheck/build verification checklist | Still valid, not done |
| 022 | #72 | Create the production deployment runbook | Blocked — hosting |
| 023 | #73 | Document PostGIS production database setup | Blocked — provider |
| 024 | #74 | Add a backup and restore verification checklist | Blocked — provider |
| 025 | #75 | Add a monitoring and alerting checklist | Blocked — hosting |
| 026 | #76 | Add a credential rotation checklist | Blocked — deploy |
| 027 | #77 | Verify the Resend sending domain setup | Blocked — domain |
| 028 | #78 | Set and verify the GitHub Actions cron variables | Blocked — deployed API |

## Deferred / not created (029–034)

Drafts 029–034 do not exist as GitHub issues and were not created by this audit either — see the existing "Deferred (not seeded)" section below. No status change.

## New frontend wave — not yet created (035–040)

Prepared 2026-08-27, approved by the repo owner, **not yet seeded as GitHub issues**. See `README.md`'s "New frontend wave" table for the owner/priority/dependency summary and each draft file for full detail.

| Draft # | Title | Owner |
| --- | --- | --- |
| 035 | Add a shared admin KpiCard primitive and fix the AdminHeader route-label gap | Ian |
| 036 | Restore Office Performance Summary and other orphaned Dashboard sections | Kian |
| 037 | Improve Work Orders workspace hierarchy, urgency visibility, and scanning | Ian |
| 038 | Add sortable, rankable triage view to Barangay Insights | Kian |
| 039 | Align Interactive Map legend and marker colors to the token system | Kian |
| 040 | Add a shared admin EmptyState component and migrate existing usages | Either (last) |

**Dry-run command** (repo owner runs manually):

```powershell
.\scripts\github-issues\create-issues.ps1 -Only 035,036,037,038,039,040 -DryRun
```

**Create command** (repo owner runs manually, after reviewing the dry run):

```powershell
.\scripts\github-issues\create-issues.ps1 -Only 035,036,037,038,039,040
```

---

## Created issues

| Draft # | GitHub Issue | Title | Labels | Created | Notes |
| --- | --- | --- | --- | --- | --- |
| 001 | #42 | Add failed-login throttling for admin login | security, priority:p1, backend | 2026-08-12 | Active |
| 002 | #43 | Add baseline HTTP security response headers | security, priority:p1, frontend | 2026-08-12 | Active |
| 011 | #44 | Add root and admin SSR/API error boundaries | reliability, priority:p1, frontend | 2026-08-12 | Active |
| 012 | #45 | Fix citizen error boundaries to use the recovering retry prop | reliability, priority:p2, frontend | 2026-08-12 | Active |
| 016 | #46 | Reduce report creation in admin-tickets.spec.ts | testing, priority:p2, dx | 2026-08-12 | Active |
| 003 | #48 | Add max length bounds for free-text fields | security, priority:p2, backend | 2026-08-12 | Active |
| 004 | #49 | Add login audit events | security, priority:p2, backend | 2026-08-12 | Active |
| 007 | #50 | Add security tests for office-scoped CSV exports | security, testing, priority:p2 | 2026-08-12 | Active |
| 008 | #51 | Close remaining gaps in work-order office-scoping tests | security, testing, priority:p2 | 2026-08-12 | Active |
| 009 | #52 | Add security tests for ticket reassignment behavior | security, testing, priority:p2 | 2026-08-12 | Active |
| 010 | #53 | Add citizen cross-account report access regression test | security, testing, priority:p2 | 2026-08-12 | Active |
| 005 | #62 | Add Content-Security-Policy in Report-Only mode | security, priority:p3, frontend, blocked | 2026-08-13 | Active |
| 006 | #63 | Review trust proxy behavior before deployment | security, deployment, priority:p3, blocked | 2026-08-13 | Active |
| 013 | #64 | Add a better fallback UI when the API is unavailable | reliability, priority:p3, frontend | 2026-08-13 | Active |
| 014 | #65 | Improve Resend/email failure visibility in development | reliability, priority:p3, backend, dx | 2026-08-13 | Active |
| 015 | #66 | Add clearer API startup validation messages | reliability, priority:p3, backend, dx | 2026-08-13 | Active |
| 017 | #67 | Document and standardize the shared-fixture strategy | testing, priority:p2, docs | 2026-08-13 | Active |
| 018 | #68 | Plan per-run test database isolation | testing, priority:p3, spike | 2026-08-13 | Active |
| 019 | #69 | Add Playwright to CI | testing, ci, priority:p4, blocked | 2026-08-13 | Active |
| 020 | #70 | Add a CI job summary for build and test results | ci, priority:p4, dx | 2026-08-13 | Active |
| 021 | #71 | Add a lint/typecheck/build verification checklist | ci, docs, priority:p3, dx | 2026-08-13 | Active |
| 022 | #72 | Create the production deployment runbook | deployment, docs, priority:p3, blocked | 2026-08-13 | Active |
| 023 | #73 | Document PostGIS production database setup | deployment, docs, priority:p3, blocked | 2026-08-13 | Active |
| 024 | #74 | Add a backup and restore verification checklist | deployment, priority:p2, blocked | 2026-08-13 | Active |
| 025 | #75 | Add a monitoring and alerting checklist | deployment, priority:p3, blocked | 2026-08-13 | Active |
| 026 | #76 | Add a credential rotation checklist | deployment, priority:p3, blocked | 2026-08-13 | Active |
| 027 | #77 | Verify the Resend sending domain setup | deployment, priority:p2, blocked | 2026-08-13 | Active |
| 028 | #78 | Set and verify the GitHub Actions cron variables | deployment, priority:p2, blocked | 2026-08-13 | Active |

## Duplicate issues closed

| Draft # | Duplicate Issue | Original Issue | Title | Notes |
| --- | --- | --- | --- | --- |
| 003 | #54 | #48 | Add max length bounds for free-text fields | Accidental duplicate; closed |
| 004 | #55 | #49 | Add login audit events | Accidental duplicate; closed |
| 007 | #56 | #50 | Add security tests for office-scoped CSV exports | Accidental duplicate; closed |
| 008 | #57 | #51 | Close remaining gaps in work-order office-scoping tests | Accidental duplicate; closed |
| 009 | #58 | #52 | Add security tests for ticket reassignment behavior | Accidental duplicate; closed |
| 010 | #59 | #53 | Add citizen cross-account report access regression test | Accidental duplicate; closed |

## Deferred (not seeded)

Drafts 029-034 are not represented above because they do not exist as open GitHub issues. They remain deferred per `README.md` and `docs/project-status.md` and must not be created without a stated requirement first.

## Created batches

### Batch 1 — 2026-08-12

Created with:

```powershell
.\scripts\github-issues\create-issues.ps1 -Only 011,001,002,012,016
```

Created active issues: #42, #43, #44, #45, and #46.

### Batch 2 — 2026-08-12

Created with:

```powershell
.\scripts\github-issues\create-issues.ps1 -Only 003,004,007,008,009,010
```

Created active issues: #48, #49, #50, #51, #52, and #53.

### Accidental duplicate batch — 2026-08-12

The duplicate creation run produced #54 through #59 for drafts 003, 004, 007, 008, 009, and 010. Those issues were closed as duplicates of the Batch 2 active issues and must not be treated as active originals.

### Batch 3 — remaining actionable drafts (seeded, tracked 2026-08-13)

Drafts 005, 006, 013-015, 017-028 were created as issues #62-#78 (#47/#60/#61 were not assigned to these drafts). This entry reconciles the tracker with the live `gh issue list` state; the exact creation command used is not recorded.

Created active issues: #62, #63, #64, #65, #66, #67, #68, #69, #70, #71, #72, #73, #74, #75, #76, #77, #78.