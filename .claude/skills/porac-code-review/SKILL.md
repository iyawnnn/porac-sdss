---
name: porac-code-review
description: Review the current PORAC-SDSS working diff before commit or PR — RBAC and office scoping, citizen/admin separation, internal work-order data leaks, audit and rate-limit preservation, migration/docs drift, scope creep against the GitHub issue. Use when the user asks to review their diff or check a change before committing.
---

# PORAC-SDSS code review

## When to use

- Before committing or opening a PR on a PORAC-SDSS change.
- After `porac-github-issue-implementation` finishes, as the second pass.

## When not to use

- To implement or fix the issue itself → `porac-github-issue-implementation`.
- To pick test commands → `porac-test-verification`.
- For generic style nits with no security, scope, or correctness angle.

## How to call it

```
Use porac-code-review on my current diff.
Use porac-code-review on my current diff against GitHub issue #44's acceptance criteria.
```

Start from `git diff` / `git diff --staged` and the branch's changed files. Read the surrounding code, not only the diff hunks — a removed guard is invisible if you only read added lines.

## Review checklist

**Security and access control**
- RBAC and office scoping: does every new/changed admin query still go through the existing scope helper (`resolveOfficeScope` and friends in `api/src/common/`)? A second authorization path is a finding.
- Citizen/admin separation: correct guard (`AdminSessionGuard` vs `CitizenSessionGuard`), correct JWT audience, no route left ungated.
- Internal data exposure: `work_orders.notes` and other internal-only fields must not reach a citizen-facing type or response.
- Audit trail: actions that previously wrote an audit event still do.
- Rate limits: no bypass, no widened window, no test-only escape hatch.
- General security regressions — cross-check `docs/security.md` and `docs/security-hardening-plan.md`.

**Data and docs drift**
- Schema change without a `docs/database.md` update, or a new migration script missing from the command lists in `README.md` and `CLAUDE.md`.
- Behavior change without the matching doc update (`features.md`, `user-flows.md`, `triage-model.md`, `testing.md`, `deployment-readiness.md`).
- State change not reflected in `docs/project-status.md`.

**Scope and UI discipline**
- Does the diff match the GitHub issue's acceptance criteria — nothing missing, nothing extra?
- No new product feature smuggled in alongside the fix.
- No sidebar/nav entry or dashboard quick action for a route that does not exist.
- UI changes confined to the surface the issue names.

**Tests and comments**
- Testing impact: which specs cover the touched paths, and does the diff invalidate any of them? No production behavior bent purely to make a test pass.
- Comments explain non-obvious business/security constraints; no restating of obvious code.

## Output format

```
### Blocking issues
- file:line — what's wrong and why it blocks

### Non-blocking concerns
- file:line — concern

### Suggested fixes
- concrete change per blocking issue

### Verification commands to run
- command — why this one

### Docs that may need updates
- path — what changed that makes it stale

### Safe to commit?
Yes / No — one sentence why.
```

If nothing is found in a section, say so in one line rather than padding it.