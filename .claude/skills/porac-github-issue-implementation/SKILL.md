---
name: porac-github-issue-implementation
description: Implement one focused PORAC-SDSS GitHub issue end to end — read the issue body, scope it against repo docs, plan, make the smallest change, verify with targeted tests. Use when the user names a GitHub issue number, pastes an issue body, or points at a local issue draft.
---

# PORAC-SDSS GitHub issue implementation

## When to use

- Implementing a single GitHub issue from this repo's backlog.
- Input can be any of:
  - a GitHub issue number (`#44`) — fetch/read the issue body first
  - a pasted issue body
  - a local draft under `.github/ISSUE_DRAFTS/`, **only while those drafts still exist**

## When not to use

- Exploratory refactors, or work with no issue behind it.
- Reviewing an existing diff → use `porac-code-review`.
- Deciding which tests to run → use `porac-test-verification`.
- Multi-issue batches. One issue at a time.

## How to call it

```
Use porac-github-issue-implementation for GitHub issue #44. Read the issue first. Plan first; do not edit yet.
Use porac-github-issue-implementation for this pasted issue body: <paste>
Use porac-github-issue-implementation for .github/ISSUE_DRAFTS/011-reliability-ssr-error-boundaries.md
```

## Source of truth

- If the issue exists on GitHub, **the GitHub issue body wins** — over drafts, over memory, over an older summary in chat.
- `.github/ISSUE_DRAFTS/` is temporary seeding material and may be deleted. Never require it to exist, never treat a draft as authoritative once the GitHub issue is open.
- Only implement issues that are live work: an item parked in `docs/project-status.md` §5 (deferred) stays unimplemented until it is promoted into §4 (current queue).

## Implementation loop

1. **Read the issue body** (fetch by number, or use the pasted/draft text).
2. **State the scope and acceptance criteria** in your own words — what is in, what is explicitly out.
3. **Read the relevant repo docs** for the area being touched. Reference them; do not re-derive their contents:
   - `CLAUDE.md` — architecture, two-app split, terminology, ORM-by-column-type rule
   - `README.md` — setup and command lists
   - `docs/project-status.md` — is this actually queued work?
   - `docs/features.md`, `docs/user-flows.md` — existing behavior and role boundaries
   - `docs/security.md`, `docs/security-hardening-plan.md` — auth, RBAC, rate limits
   - `docs/database.md` — schema ownership before any column/table change
   - `docs/triage-model.md` — before touching urgency/priority math
   - `docs/testing.md`, `docs/deployment-readiness.md`
4. **Inspect the actual files** before editing — the routes, services, guards, and specs involved. No edits based on assumption.
5. **Produce a short implementation plan first**: files to touch, the change in each, tests to run, docs to update.
6. **Ask before editing** if the issue is risky, ambiguous, or could change product behavior (auth, scoring, schema, citizen-visible copy or data).
7. **Implement the smallest focused change** that satisfies the acceptance criteria.
8. **Run targeted verification only** (see `porac-test-verification`).
9. **Summarize**: changed files, tests run and their result, risks, follow-up work left out of scope.

## Hard rules

- Do not invent product features. If the issue implies one, say so and stop — do not silently expand an issue into a larger feature.
- Do not weaken RBAC, office scoping, audit logging, or rate limits. Do not add test-only bypasses to any anti-abuse control.
- Never expose `work_orders.notes` (internal-only) in a citizen-facing type, response, or view.
- Never add a sidebar entry, quick action, or link for a route that does not exist yet.
- If the issue conflicts with the repo docs, **stop and report the conflict** rather than guessing which is right.
- If only tests, docs, or scripts are in scope, do not touch app runtime code.
- Keep the change PR-sized and reviewable.

## Docs and command-list upkeep

- New DB migration script → add it to the migration command list in **both** `README.md` and `CLAUDE.md`, in the correct dependency order, and update `docs/database.md`.
- Behavior change → update the doc that describes that behavior (`features.md`, `user-flows.md`, `security.md`, `triage-model.md`, `testing.md`, `deployment-readiness.md`).
- Feature/hardening item changing state → update `docs/project-status.md` in the same change.
- No behavior change → do not touch docs.

## Comments

Write comments only for non-obvious business or security constraints (why a lock is advisory, why a window doesn't slide, why a field is office-scoped). Do not narrate what the code plainly does.