# Created GitHub Issues Tracker

Manual tracker for PORAC-SDSS GitHub issues already created from `.github/ISSUE_DRAFTS/`.

Last updated: 2026-08-12

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

## Duplicate issues closed

| Draft # | Duplicate Issue | Original Issue | Title | Notes |
| --- | --- | --- | --- | --- |
| 003 | #54 | #48 | Add max length bounds for free-text fields | Accidental duplicate; closed |
| 004 | #55 | #49 | Add login audit events | Accidental duplicate; closed |
| 007 | #56 | #50 | Add security tests for office-scoped CSV exports | Accidental duplicate; closed |
| 008 | #57 | #51 | Close remaining gaps in work-order office-scoping tests | Accidental duplicate; closed |
| 009 | #58 | #52 | Add security tests for ticket reassignment behavior | Accidental duplicate; closed |
| 010 | #59 | #53 | Add citizen cross-account report access regression test | Accidental duplicate; closed |

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

## Next suggested batch (future suggestion only)

The following was tested only as a dry run; it did not create GitHub issues and has no tracker entries in the Created issues table:

```powershell
.\scripts\github-issues\create-issues.ps1 -DryRun -Only 017,021,014
```

If this batch is created later, record the assigned issue numbers manually in this tracker.
