# Created GitHub Issues Tracker

Manual tracker for PORAC-SDSS GitHub issues already created from `.github/ISSUE_DRAFTS/`.

Last updated: 2026-08-13

Summary: **28 active seeded issues** · **6 closed duplicate issues** · **0 implemented issues recorded by this tracker**

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