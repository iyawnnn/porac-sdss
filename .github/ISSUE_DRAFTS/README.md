# Issue Drafts

Local Markdown drafts for GitHub issues. **These are drafts, not issues.** Nothing here has been filed.

Create them with `scripts/github-issues/create-issues.ps1`, which you run manually so the issues are authored by **your** GitHub account. Run `gh auth status` first and confirm the account before running it.

Each draft is written to be copy-pasted into Claude Code as implementation context. Every one ends with a **Claude Code handoff prompt** — a short block stating what to implement, what to read first, what to avoid, and how to verify.

Source of truth for what is and is not queued: [`docs/project-status.md`](../../docs/project-status.md).

---

## Index

| # | Title | Category | Priority | Status |
|---|---|---|---|---|
| 001 | Add failed-login throttling for admin login | Security | P1 | Immediate |
| 002 | Add baseline HTTP security response headers | Security | P1 | Immediate |
| 003 | Add max length bounds for free-text fields | Security | P2 | Immediate |
| 004 | Add login audit events | Security | P2 | Immediate |
| 005 | Add CSP in Report-Only mode | Security | P3 | Blocked by 002 |
| 006 | Review trust proxy behavior before deployment | Security | P3 | Blocked — hosting |
| 007 | Add security tests for office-scoped CSV exports | Security / Testing | P2 | Immediate |
| 008 | Close remaining gaps in work-order office-scoping tests | Security / Testing | P2 | Immediate |
| 009 | Add security tests for ticket reassignment behavior | Security / Testing | P2 | Immediate |
| 010 | Add citizen cross-account report access regression test | Security / Testing | P2 | Immediate |
| 011 | Add root and admin SSR/API error boundaries | Reliability | P1 | Immediate |
| 012 | Fix citizen error boundaries to use the recovering retry prop | Reliability | P2 | Immediate |
| 013 | Add a better fallback UI when the API is unavailable | Reliability | P3 | After 011, 012 |
| 014 | Improve Resend/email failure visibility in development | Reliability | P3 | Immediate |
| 015 | Add clearer API startup validation messages | Reliability | P3 | Immediate |
| 016 | Reduce report creation in admin-tickets.spec.ts | Testing | P2 | Immediate |
| 017 | Document and standardize the shared-fixture strategy | Testing | P2 | After 016 |
| 018 | Plan per-run test database isolation | Testing | P3 | Immediate (spike) |
| 019 | Add Playwright to CI | Testing / CI | P4 | Blocked by 018 |
| 020 | Add a CI job summary for build and test results | CI | P4 | Immediate |
| 021 | Add a lint/typecheck/build verification checklist | CI / Docs | P3 | Immediate |
| 022 | Create the production deployment runbook | Deployment | P3 | Blocked — hosting |
| 023 | Document PostGIS production database setup | Deployment | P3 | Blocked — provider |
| 024 | Add a backup and restore verification checklist | Deployment | P2 | Blocked — provider |
| 025 | Add a monitoring and alerting checklist | Deployment | P3 | Blocked — hosting |
| 026 | Add a credential rotation checklist | Deployment / Security | P3 | Blocked — deploy |
| 027 | Verify the Resend sending domain setup | Deployment | P2 | Blocked — domain |
| 028 | Set and verify the GitHub Actions cron variables | Deployment | P2 | Blocked — deployed API |
| 029 | [Deferred] Support multiple photos per report | Deferred | — | **Deferred** |
| 030 | [Deferred] Video uploads — out of scope | Deferred | — | **Deferred (wontfix)** |
| 031 | [Deferred] Citizen-facing work-order status rollup | Deferred | — | **Deferred** |
| 032 | [Deferred] Export audit logging | Deferred | — | **Deferred** |
| 033 | [Deferred] Low-elevation / hazard-prone map filter | Deferred | — | **Deferred** |
| 034 | [Deferred] Barangay Insights CSV export | Deferred | — | **Deferred** |

**28 actionable · 6 deferred · 34 total**

---

## Recommended implementation order

### Wave 1 — do first (highest value, no blockers)

1. **011** — SSR/API error boundaries. The only P1 that is a functional defect; a transient API blip currently replaces the whole admin app, login form included.
2. **001** — Failed-login throttling. Highest-severity security gap, and the admin email convention is published.
3. **002** — Baseline security headers. ~12 lines of config, immediate clickjacking protection.
4. **012** — Citizen error boundary retry prop. Small; pairs naturally with 011.
5. **016** — Reduce report creation in `admin-tickets.spec.ts`. Quality-of-life for everyone: lets the team run the full suite more often.

### Wave 2 — security tests and remaining hardening

**010** (cheapest test, zero report cost) → **007** → **009** → **008** → **003** → **004**

### Wave 3 — developer experience and planning

**017** (after 016) → **021** → **014** → **015** → **018** (spike) → **013** (after 011/012) → **005** (after 002) → **020**

### Wave 4 — deployment (all gated on decisions, not effort)

Once a hosting platform and domain are chosen: **023** → **024** → **027** → **028** → **026** → **006** → **025** → **022** (runbook last — write it from a real deploy).
Then **019** (Playwright in CI), once 018's isolation work has landed.

### Not scheduled

**029–034.** Do not start these. Each needs a stated requirement and promotion into `docs/project-status.md` §4 first. 030 is a decision record — the answer is no.

---

## Notes on scope discipline

Several drafts deliberately record things **not** to do, because they came up during the audits that produced this backlog:

- **No test-only rate-limit bypass** (001, 019). Standing prohibition — `docs/security.md` §8.3.
- **No MFA, CAPTCHA, WAF, SIEM, or SSO** (001, 025). Explicitly out of proportion — `docs/security-hardening-plan.md` §5.5.
- **No per-request CSRF token.** Assessed and found unnecessary: all 33 state-changing endpoints are POST/PATCH/DELETE, which `SameSite=Lax` already covers.
- **No weakening of RBAC, office scoping, audit trails, or rate limits** for convenience — anywhere.
- **009 pins existing behavior rather than changing it.** Ticket reassignment is *not* System-Administrator-only; that was a documentation error, now corrected. Changing the permission model is a separate product decision.
