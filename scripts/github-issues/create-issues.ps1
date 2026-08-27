# =============================================================================
#  PORAC-SDSS — GitHub issue creation
# =============================================================================
#
#  THIS SCRIPT DOES NOT RUN AUTOMATICALLY. Read it before running it.
#
#  BEFORE YOU RUN THIS:
#
#    1. Check who you are authenticated as:
#
#           gh auth status
#
#    2. ISSUES WILL BE CREATED UNDER THE AUTHENTICATED GITHUB ACCOUNT.
#       Every issue will show that account as the author. If `gh auth status`
#       shows the wrong account, fix it before continuing:
#
#           gh auth login
#
#    3. Confirm the target repository is correct:
#
#           gh repo view --json nameWithOwner -q .nameWithOwner
#
#       Expected: iyawnnn/porac-sdss
#
#    4. Do a dry run first to see exactly what would be created:
#
#           .\scripts\github-issues\create-issues.ps1 -DryRun
#
#    5. Labels must exist before they can be applied. Create them once with:
#
#           .\scripts\github-issues\create-issues.ps1 -CreateLabels
#
#       (gh fails an issue creation if a referenced label does not exist.)
#
#    6. Then create the issues for real:
#
#           .\scripts\github-issues\create-issues.ps1
#
#       Or a subset:
#
#           .\scripts\github-issues\create-issues.ps1 -Only 001,002,011
#           .\scripts\github-issues\create-issues.ps1 -SkipDeferred
#
#  Issue bodies come from .github/ISSUE_DRAFTS/*.md. Edit the drafts, not this
#  script, to change issue content.
#
#  This script only creates issues. It never edits, closes, or deletes them,
#  and it never pushes code.
#
# =============================================================================

[CmdletBinding()]
param(
    # Print what would be created without calling gh.
    [switch]$DryRun,

    # Create the labels used below, then exit without creating issues.
    [switch]$CreateLabels,

    # Only create these issue numbers, e.g. -Only 001,002,011
    [string[]]$Only,

    # Skip the six deferred drafts (029-034).
    [switch]$SkipDeferred,

    # Recreate drafts already listed as Active in CREATED_ISSUES.md.
    [switch]$ForceRecreate
)

$ErrorActionPreference = 'Stop'

$repoRoot  = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$draftsDir = Join-Path $repoRoot '.github\ISSUE_DRAFTS'
$createdIssuesTracker = Join-Path $draftsDir 'CREATED_ISSUES.md'

if (-not (Test-Path $draftsDir)) {
    throw "Issue drafts directory not found: $draftsDir"
}

if (-not (Test-Path $createdIssuesTracker)) {
    throw "Created issues tracker not found: $createdIssuesTracker"
}

# -----------------------------------------------------------------------------
#  Labels
# -----------------------------------------------------------------------------
$labels = @(
    @{ Name = 'security';      Color = 'd73a4a'; Description = 'Security hardening or a security-relevant fix' },
    @{ Name = 'reliability';   Color = 'fbca04'; Description = 'Error handling, resilience, availability' },
    @{ Name = 'testing';       Color = '0e8a16'; Description = 'Test coverage or test infrastructure' },
    @{ Name = 'ci';            Color = '1d76db'; Description = 'Continuous integration' },
    @{ Name = 'deployment';    Color = '5319e7'; Description = 'Deployment readiness and operations' },
    @{ Name = 'docs';          Color = '0075ca'; Description = 'Documentation' },
    @{ Name = 'dx';            Color = 'c2e0c6'; Description = 'Developer experience' },
    @{ Name = 'frontend';      Color = 'bfd4f2'; Description = 'Next.js app' },
    @{ Name = 'backend';       Color = 'd4c5f9'; Description = 'NestJS API' },
    @{ Name = 'blocked';       Color = 'b60205'; Description = 'Blocked on a decision or another issue' },
    @{ Name = 'spike';         Color = 'fef2c0'; Description = 'Investigation or design, no implementation' },
    @{ Name = 'deferred';      Color = 'e4e669'; Description = 'Not scheduled; needs a stated requirement first' },
    @{ Name = 'discussion';    Color = 'cfd3d7'; Description = 'Needs a decision before any work' },
    @{ Name = 'product';       Color = 'bfdadc'; Description = 'Product scope question' },
    @{ Name = 'wontfix';       Color = 'ffffff'; Description = 'Deliberately not planned' },
    @{ Name = 'priority:p1';   Color = 'b60205'; Description = 'Do first' },
    @{ Name = 'priority:p2';   Color = 'd93f0b'; Description = 'Do soon' },
    @{ Name = 'priority:p3';   Color = 'fbca04'; Description = 'Do when convenient' },
    @{ Name = 'priority:p4';   Color = 'c5def5'; Description = 'Nice to have' }
)

if ($CreateLabels) {
    Write-Host 'Creating labels...' -ForegroundColor Cyan
    foreach ($l in $labels) {
        Write-Host ("  {0}" -f $l.Name)
        if (-not $DryRun) {
            # --force updates an existing label instead of failing.
            gh label create $l.Name --color $l.Color --description $l.Description --force
        }
    }
    Write-Host 'Labels done. Re-run without -CreateLabels to create the issues.' -ForegroundColor Green
    return
}

# -----------------------------------------------------------------------------
#  Issue definitions
#  Title must match the H1 of the corresponding draft file.
# -----------------------------------------------------------------------------
$issues = @(

    # ---------- Security / hardening ----------
    @{ Num = '001'; File = '001-security-failed-login-throttling.md'
       Title = 'Add failed-login throttling for admin login'
       Labels = 'security,priority:p1,backend' }

    @{ Num = '002'; File = '002-security-baseline-http-headers.md'
       Title = 'Add baseline HTTP security response headers'
       Labels = 'security,priority:p1,frontend' }

    @{ Num = '003'; File = '003-security-free-text-bounds.md'
       Title = 'Add max length bounds for free-text fields'
       Labels = 'security,priority:p2,backend' }

    @{ Num = '004'; File = '004-security-login-audit-events.md'
       Title = 'Add login audit events'
       Labels = 'security,priority:p2,backend' }

    @{ Num = '005'; File = '005-security-csp-report-only.md'
       Title = 'Add Content-Security-Policy in Report-Only mode'
       Labels = 'security,priority:p3,frontend,blocked' }

    @{ Num = '006'; File = '006-security-trust-proxy-review.md'
       Title = 'Review trust proxy behavior before deployment'
       Labels = 'security,deployment,priority:p3,blocked' }

    @{ Num = '007'; File = '007-security-test-office-scoped-exports.md'
       Title = 'Add security tests for office-scoped CSV exports'
       Labels = 'security,testing,priority:p2' }

    @{ Num = '008'; File = '008-security-test-work-order-office-scoping.md'
       Title = 'Close remaining gaps in work-order office-scoping tests'
       Labels = 'security,testing,priority:p2' }

    @{ Num = '009'; File = '009-security-test-reassignment-behavior.md'
       Title = 'Add security tests for ticket reassignment behavior'
       Labels = 'security,testing,priority:p2' }

    @{ Num = '010'; File = '010-security-test-citizen-cross-account-access.md'
       Title = 'Add citizen cross-account report access regression test'
       Labels = 'security,testing,priority:p2' }

    # ---------- Reliability ----------
    @{ Num = '011'; File = '011-reliability-ssr-error-boundaries.md'
       Title = 'Add root and admin SSR/API error boundaries'
       Labels = 'reliability,priority:p1,frontend' }

    @{ Num = '012'; File = '012-reliability-citizen-error-boundary-retry.md'
       Title = 'Fix citizen error boundaries to use the recovering retry prop'
       Labels = 'reliability,priority:p2,frontend' }

    @{ Num = '013'; File = '013-reliability-api-unavailable-fallback-ui.md'
       Title = 'Add a better fallback UI when the API is unavailable'
       Labels = 'reliability,priority:p3,frontend' }

    @{ Num = '014'; File = '014-reliability-email-failure-visibility.md'
       Title = 'Improve Resend/email failure visibility in development'
       Labels = 'reliability,priority:p3,backend,dx' }

    @{ Num = '015'; File = '015-reliability-env-validation-messages.md'
       Title = 'Add clearer API startup validation messages for missing env vars'
       Labels = 'reliability,priority:p3,backend,dx' }

    # ---------- Testing / CI ----------
    @{ Num = '016'; File = '016-testing-reduce-report-creation.md'
       Title = 'Reduce report creation in admin-tickets.spec.ts'
       Labels = 'testing,priority:p2,dx' }

    @{ Num = '017'; File = '017-testing-shared-fixture-strategy.md'
       Title = 'Document and standardize the Playwright shared-fixture strategy'
       Labels = 'testing,priority:p2,docs' }

    @{ Num = '018'; File = '018-testing-db-isolation-plan.md'
       Title = 'Plan per-run test database isolation'
       Labels = 'testing,priority:p3,spike' }

    @{ Num = '019'; File = '019-testing-playwright-ci.md'
       Title = 'Add Playwright to CI (after database isolation)'
       Labels = 'testing,ci,priority:p4,blocked' }

    @{ Num = '020'; File = '020-ci-job-summary.md'
       Title = 'Add a CI job summary for build and test results'
       Labels = 'ci,priority:p4,dx' }

    @{ Num = '021'; File = '021-ci-verification-checklist.md'
       Title = 'Add a lint/typecheck/build verification checklist'
       Labels = 'ci,docs,priority:p3,dx' }

    # ---------- Deployment readiness ----------
    @{ Num = '022'; File = '022-deployment-runbook.md'
       Title = 'Create the production deployment runbook (after hosting is chosen)'
       Labels = 'deployment,docs,priority:p3,blocked' }

    @{ Num = '023'; File = '023-deployment-postgis-production-setup.md'
       Title = 'Document PostGIS production database setup (after provider decision)'
       Labels = 'deployment,docs,priority:p3,blocked' }

    @{ Num = '024'; File = '024-deployment-backup-restore-verification.md'
       Title = 'Add a backup and restore verification checklist'
       Labels = 'deployment,priority:p2,blocked' }

    @{ Num = '025'; File = '025-deployment-monitoring-alerting.md'
       Title = 'Add a monitoring and alerting checklist'
       Labels = 'deployment,priority:p3,blocked' }

    @{ Num = '026'; File = '026-deployment-credential-rotation.md'
       Title = 'Add a credential rotation checklist'
       Labels = 'deployment,security,priority:p3,blocked' }

    @{ Num = '027'; File = '027-deployment-resend-sending-domain.md'
       Title = 'Verify the Resend sending domain setup'
       Labels = 'deployment,priority:p2,blocked' }

    @{ Num = '028'; File = '028-deployment-cron-variables.md'
       Title = 'Set and verify the GitHub Actions cron variables'
       Labels = 'deployment,priority:p2,blocked' }

    # ---------- Deferred product ideas (NOT active work) ----------
    @{ Num = '029'; File = '029-deferred-multiple-report-photos.md'
       Title = '[Deferred] Support multiple photos per report'
       Labels = 'deferred,discussion,product' }

    @{ Num = '030'; File = '030-deferred-video-uploads-out-of-scope.md'
       Title = '[Deferred] Video uploads - deliberately out of scope'
       Labels = 'deferred,wontfix,product' }

    @{ Num = '031'; File = '031-deferred-citizen-work-order-rollup.md'
       Title = '[Deferred] Citizen-facing work-order status rollup'
       Labels = 'deferred,discussion,product' }

    @{ Num = '032'; File = '032-deferred-export-audit-logging.md'
       Title = '[Deferred] Export audit logging'
       Labels = 'deferred,discussion,security' }

    @{ Num = '033'; File = '033-deferred-low-elevation-map-filter.md'
       Title = '[Deferred] Low-elevation / hazard-prone map filter'
       Labels = 'deferred,discussion,product' }

    @{ Num = '034'; File = '034-deferred-barangay-insights-csv-export.md'
       Title = '[Deferred] CSV export for Barangay Insights'
       Labels = 'deferred,discussion,product' }

    # ---------- New frontend wave (2026-08-27, Ian/Kian) ----------
    @{ Num = '035'; File = '035-frontend-shared-kpi-card-header-fix.md'
       Title = 'Add a shared admin KpiCard primitive and fix the AdminHeader route-label gap'
       Labels = 'frontend,priority:p1' }

    @{ Num = '036'; File = '036-frontend-dashboard-operational-sections.md'
       Title = 'Restore Office Performance Summary and other orphaned Dashboard sections'
       Labels = 'frontend,priority:p2' }

    @{ Num = '037'; File = '037-frontend-work-orders-redesign.md'
       Title = 'Improve Work Orders workspace hierarchy, urgency visibility, and scanning'
       Labels = 'frontend,priority:p2' }

    @{ Num = '038'; File = '038-frontend-barangay-insights-decision-support.md'
       Title = 'Add sortable, rankable triage view to Barangay Insights'
       Labels = 'frontend,priority:p2' }

    @{ Num = '039'; File = '039-frontend-map-refinement.md'
       Title = 'Align Interactive Map legend and marker colors to the token system'
       Labels = 'frontend,priority:p3' }

    @{ Num = '040'; File = '040-frontend-shared-empty-state.md'
       Title = 'Add a shared admin EmptyState component and migrate existing usages'
       Labels = 'frontend,priority:p3' }
)

# -----------------------------------------------------------------------------
#  Filtering
# -----------------------------------------------------------------------------
$selected = $issues

if ($SkipDeferred) {
    # Filter by the 'deferred' label rather than a numeric cutoff, so this
    # stays correct as new non-deferred drafts (e.g. 035+) are appended after
    # the deferred block (029-034) in the array above.
    $selected = $selected | Where-Object { $_.Labels -notmatch '(^|,)deferred(,|$)' }
}

if ($Only) {
    $wanted = $Only | ForEach-Object { $_.PadLeft(3, '0') }
    $selected = $selected | Where-Object { $wanted -contains $_.Num }
}
$selected = @($selected)


if (-not $selected) {
    Write-Host 'No issues selected. Check your -Only / -SkipDeferred arguments.' -ForegroundColor Yellow
    return
}

# CREATED_ISSUES.md is intentionally updated manually. Only rows whose Notes
# column is Active represent existing issues to skip; closed duplicates do not.
$activeCreatedIssues = @{}
foreach ($line in Get-Content -LiteralPath $createdIssuesTracker) {
    if ($line -match '^\|\s*(?<draft>\d{3})\s*\|\s*(?<issue>#\d+)\s*\|.*\|\s*Active\s*\|\s*$') {
        $activeCreatedIssues[$matches.draft] = $matches.issue
    }
}

if ($ForceRecreate) {
    Write-Host ''
    Write-Host 'WARNING: -ForceRecreate is enabled. Active tracked drafts may be recreated.' -ForegroundColor Red
    Write-Host '         This can create duplicate GitHub issues.' -ForegroundColor Red
} else {
    $issuesToSkip = @($selected | Where-Object { $activeCreatedIssues.ContainsKey($_.Num) })
    foreach ($issue in $issuesToSkip) {
        Write-Host ("Skipping {0} because it is already tracked as {1} in CREATED_ISSUES.md" -f $issue.Num, $activeCreatedIssues[$issue.Num]) -ForegroundColor Yellow
    }
    $selected = @($selected | Where-Object { -not $activeCreatedIssues.ContainsKey($_.Num) })

    if (-not $selected) {
        Write-Host 'No issues remain after skipping Active entries in CREATED_ISSUES.md.' -ForegroundColor Green
        return
    }
}

# -----------------------------------------------------------------------------
#  Pre-flight
# -----------------------------------------------------------------------------
Write-Host ''
Write-Host '=== PORAC-SDSS issue creation ===' -ForegroundColor Cyan
Write-Host ("Drafts directory : {0}" -f $draftsDir)
Write-Host ("Issues selected  : {0}" -f $selected.Count)
if ($DryRun) {
    Write-Host 'Mode             : DRY RUN (nothing will be created)' -ForegroundColor Yellow
} else {
    Write-Host 'Mode             : LIVE - issues will be created' -ForegroundColor Red
    Write-Host ''
    Write-Host 'Issues will be authored by the account shown in `gh auth status`.' -ForegroundColor Yellow
    Write-Host 'Press Ctrl+C now if that is not the account you want.' -ForegroundColor Yellow
    Write-Host ''
    $confirm = Read-Host 'Type CREATE to continue'
    if ($confirm -cne 'CREATE') {
        Write-Host 'Aborted.' -ForegroundColor Yellow
        return
    }
}
Write-Host ''

# Verify every draft file exists before creating anything, so a typo does not
# leave a half-created backlog.
$missing = @()
foreach ($issue in $selected) {
    $path = Join-Path $draftsDir $issue.File
    if (-not (Test-Path $path)) { $missing += $issue.File }
}
if ($missing.Count -gt 0) {
    throw ("Missing draft file(s):`n  " + ($missing -join "`n  "))
}

# -----------------------------------------------------------------------------
#  Create
# -----------------------------------------------------------------------------
$created = 0
$failed  = @()

foreach ($issue in $selected) {
    $path = Join-Path $draftsDir $issue.File
    Write-Host ("[{0}] {1}" -f $issue.Num, $issue.Title) -ForegroundColor White
    Write-Host ("      labels: {0}" -f $issue.Labels) -ForegroundColor DarkGray

    if ($DryRun) {
        Write-Host ("      would run: gh issue create --title `"{0}`" --body-file `"{1}`" --label `"{2}`"" -f $issue.Title, $issue.File, $issue.Labels) -ForegroundColor DarkGray
        continue
    }

    try {
        gh issue create --title $issue.Title --body-file $path --label $issue.Labels
        if ($LASTEXITCODE -ne 0) { throw "gh exited with code $LASTEXITCODE" }
        $created++
    }
    catch {
        Write-Host ("      FAILED: {0}" -f $_.Exception.Message) -ForegroundColor Red
        $failed += $issue.Num
    }
}

# -----------------------------------------------------------------------------
#  Summary
# -----------------------------------------------------------------------------
Write-Host ''
if ($DryRun) {
    Write-Host ("Dry run complete. {0} issue(s) would be created." -f $selected.Count) -ForegroundColor Green
    Write-Host 'Run with -CreateLabels first (once), then without -DryRun.' -ForegroundColor Cyan
} else {
    Write-Host ("Created {0} of {1} issue(s)." -f $created, $selected.Count) -ForegroundColor Green
    if ($failed.Count -gt 0) {
        Write-Host ("Failed: {0}" -f ($failed -join ', ')) -ForegroundColor Red
        Write-Host 'Re-run just those with: -Only ' -NoNewline -ForegroundColor Cyan
        Write-Host ($failed -join ',') -ForegroundColor Cyan
    }
}
Write-Host ''
