# Issue Drafts

Local Markdown drafts for GitHub issues. **These are drafts, not issues.** Nothing here has been filed.

Create them with `scripts/github-issues/create-issues.ps1`, which you run manually so the issues are authored by **your** GitHub account. Run `gh auth status` first and confirm the account before running it.

Each draft is written to be copy-pasted into Claude Code as implementation context. Every one ends with a **Claude Code handoff prompt** — a short block stating what to implement, what to read first, what to avoid, and how to verify.

Source of truth for what is and is not queued: [`docs/project-status.md`](../../docs/project-status.md).

---

## Index

**Status column note (2026-08-27 backlog audit):** drafts 001, 002, 003, 004, 007, 008, 009, 010, 011, 014, 015, 016, and 017 were verified against `docs/project-status.md` §3 and the actual current code and are **implemented in full**. Their corresponding GitHub issues have **not** been closed yet — that is a manual step the repo owner runs from their own account (see `CREATED_ISSUES.md`'s "Pending manual close" section for the exact list and evidence per issue). Until that close happens, treat the row below as "done, awaiting the GitHub close," not as still-queued work.

| # | Title | Category | Priority | Status |
|---|---|---|---|---|
| 001 | Add failed-login throttling for admin login | Security | P1 | **Implemented — pending manual close** |
| 002 | Add baseline HTTP security response headers | Security | P1 | **Implemented — pending manual close** |
| 003 | Add max length bounds for free-text fields | Security | P2 | **Implemented — pending manual close** |
| 004 | Add login audit events | Security | P2 | **Implemented — pending manual close** |
| 005 | Add CSP in Report-Only mode | Security | P3 | Unblocked (002 shipped) |
| 006 | Review trust proxy behavior before deployment | Security | P3 | Blocked — hosting |
| 007 | Add security tests for office-scoped CSV exports | Security / Testing | P2 | **Implemented — pending manual close** |
| 008 | Close remaining gaps in work-order office-scoping tests | Security / Testing | P2 | **Implemented — pending manual close** |
| 009 | Add security tests for ticket reassignment behavior | Security / Testing | P2 | **Implemented — pending manual close** |
| 010 | Add citizen cross-account report access regression test | Security / Testing | P2 | **Implemented — pending manual close** |
| 011 | Add root and admin SSR/API error boundaries | Reliability | P1 | **Implemented — pending manual close** |
| 012 | Fix citizen error boundaries to use the recovering retry prop | Reliability | P2 | Still open |
| 013 | Add a better fallback UI when the API is unavailable | Reliability | P3 | Still open, waiting on 012 |
| 014 | Improve Resend/email failure visibility in development | Reliability | P3 | **Implemented — pending manual close** |
| 015 | Add clearer API startup validation messages | Reliability | P3 | **Implemented — pending manual close** |
| 016 | Reduce report creation in admin-tickets.spec.ts | Testing | P2 | **Implemented — pending manual close** |
| 017 | Document and standardize the shared-fixture strategy | Testing | P2 | **Implemented — pending manual close** |
| 018 | Plan per-run test database isolation | Testing | P3 | Still open (spike) |
| 019 | Add Playwright to CI | Testing / CI | P4 | Blocked by 018 |
| 020 | Add a CI job summary for build and test results | CI | P4 | Still open |
| 021 | Add a lint/typecheck/build verification checklist | CI / Docs | P3 | Still open |
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

**28 actionable (13 implemented, pending manual close · 15 still open/blocked) · 6 deferred · 34 total**

### New frontend wave (2026-08-27), not yet created as GitHub issues

Continues the numbering after 034. Two-developer split (Ian / Kian) — see each draft's "Owner", "File ownership", and "Files the other developer should avoid" sections before starting. Full rationale in the backlog-audit conversation that produced this wave, not repeated here.

| # | Title | Owner | Priority | Depends on |
|---|---|---|---|---|
| 035 | Add a shared admin KpiCard primitive and fix the AdminHeader route-label gap | Ian | P1 (prerequisite) | — |
| 036 | Restore Office Performance Summary and other orphaned Dashboard sections | Kian | P2 | — |
| 037 | Improve Work Orders workspace hierarchy, urgency visibility, and scanning | Ian | P2 | 035 |
| 038 | Add sortable, rankable triage view to Barangay Insights | Kian | P2 | — |
| 039 | Align Interactive Map legend and marker colors to the token system | Kian | P3 (optional) | — |
| 040 | Add a shared admin EmptyState component and migrate existing usages | Either (last) | P3 | 036, 037, 038 (and 039 if taken) |

**6 new drafts, not yet seeded.** Recommended order: 035 merges first; 036 and 038 proceed in parallel with it; 037 starts once 035 merges; 039 is optional filler for whoever clears their queue first; 040 is a single-owner sweep done last, after everything else above has merged.

---

## Recommended implementation order

**Historical note (2026-08-27):** Waves 1–3 below, as originally written, are now mostly satisfied — 011, 001, 002, 016, 010, 007, 009, 008, 003, 004, 017, 014, and 015 were all verified implemented in the 2026-08-27 backlog audit (see the Index note above and `CREATED_ISSUES.md`). The lists are kept below **for historical record**, with each satisfied item struck through, rather than deleted — deleting them would lose the "why this order" reasoning the surviving items still rely on.

### Current priority — the new frontend wave (see table above)

**035** → (**036**, **038** in parallel) → **037** → **039** (optional) → **040** (last). This is the active work; everything below is the pre-existing hardening/testing/deployment backlog, still valid but not the current focus.

### Wave 1 — do first (highest value, no blockers)

1. ~~**011** — SSR/API error boundaries.~~ **Implemented, pending manual close.**
2. ~~**001** — Failed-login throttling.~~ **Implemented, pending manual close.**
3. ~~**002** — Baseline security headers.~~ **Implemented, pending manual close.**
4. **012** — Citizen error boundary retry prop. Still open. Small; pairs naturally with 011.
5. ~~**016** — Reduce report creation in `admin-tickets.spec.ts`.~~ **Implemented, pending manual close.**

### Wave 2 — security tests and remaining hardening

~~**010** → **007** → **009** → **008** → **003** → **004**~~ **All six implemented, pending manual close.**

### Wave 3 — developer experience and planning

~~**017**~~ **(implemented)** → **021** (still open) → ~~**014**~~ **(implemented)** → ~~**015**~~ **(implemented)** → **018** (still open, spike) → **013** (still open, after 011/012 — 011 is done, 012 is not) → **005** (still open, now unblocked — 002 is done) → **020** (still open)

**Remaining from Wave 3, in order:** **021** → **018** → **005** → **020** → **013** (once 012 lands)

### Wave 4 — deployment (all gated on decisions, not effort)

Unchanged — none of these have shipped. Once a hosting platform and domain are chosen: **023** → **024** → **027** → **028** → **026** → **006** → **025** → **022** (runbook last — write it from a real deploy).
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
