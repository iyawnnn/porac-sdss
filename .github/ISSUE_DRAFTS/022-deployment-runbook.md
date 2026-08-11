# Create the production deployment runbook (after hosting is chosen)

**Labels:** `deployment`, `docs`, `priority:p3`, `blocked`
**Type:** Documentation
**Priority:** P3 — **blocked on a hosting decision**

## Background

`docs/deployment-readiness.md` §1 and §9. **Nothing has been deployed.** There is no `Dockerfile`, no `vercel.json`, no `render.yaml` — the repo commits to no platform. `PLAN.md`'s Render references are historical prototype-era notes, not a decision.

`docs/deployment-readiness.md` is the pre-production *checklist*. This issue is the *runbook* — the step-by-step procedure — which can only be written once a platform exists.

## Problem

There is no written deploy procedure, no rollback procedure, and no documented way to run a migration against a live database. Today the knowledge is entirely in one person's head, which is the specific risk a capstone handoff should not carry.

## Proposed scope

**Blocked until the hosting platform is decided.** Once it is, write `docs/runbook.md` covering:

1. **Prerequisites** — accounts, access, secrets, who can deploy.
2. **First deploy** — infrastructure provisioning, env vars on both apps, database migration and reference-data seed in the documented order, first `system_admin` creation.
3. **Routine deploy** — build, deploy, verify, expected downtime.
4. **Migration against a live database** — how to run it, how to verify, what is not reversible.
5. **Rollback** — application rollback, and the (harder) question of schema rollback.
6. **Post-deploy verification** — a short smoke list: admin login, citizen report submission, a real password-reset email, one photo upload, one cron trigger.
7. **Common failures and their fixes.**
8. **Who to contact.**

## Implementation notes

- **Write it from a real deploy, not from imagination.** A runbook written speculatively is worse than none — it will be confidently wrong at the moment it is most needed.
- Use `docs/deployment-readiness.md` as the input checklist; the runbook is the executable version of it.
- Reference, do not duplicate, `README.md` §D's migration order.
- Include the two GitHub Actions cron values (#028) and the `trust proxy` finding (#006).
- Note explicitly which steps are irreversible.

## Files likely involved

- `docs/runbook.md` (new — **do not create it before a platform is chosen**)
- `docs/deployment-readiness.md` §9 (link to it)
- `docs/project-status.md` §4.4
- `README.md` §J (link)
- `CLAUDE.md` repo-layout entry

## Acceptance criteria

- [ ] A hosting platform has actually been chosen and a first deploy performed.
- [ ] Runbook covers first deploy, routine deploy, migration, rollback, and verification.
- [ ] Every step has been executed at least once by the author.
- [ ] Irreversible steps are marked as such.
- [ ] A second person can follow it without asking questions.
- [ ] Linked from `docs/deployment-readiness.md`, `README.md` §J, and `CLAUDE.md`.

## Suggested tests

The real test: have a teammate follow the runbook end to end on a staging environment without help. Anything they have to ask about is a gap.

## Out of scope

Choosing the hosting platform (a team decision, not a task), backups (#024), monitoring (#025), and credential rotation (#026) — each has its own issue and its own section in the runbook once written.

## Risks / notes

Do not write this speculatively "to have something." An untested runbook creates false confidence.

## Claude Code handoff prompt

```
DO NOT START — blocked until a hosting platform is chosen for PORAC-SDSS AND a
first real deploy has been performed.

When unblocked:

Read first: docs/deployment-readiness.md (all of it — it is the input
checklist), README.md §D (migration and seed order, load-bearing) and §J,
CLAUDE.md (two-app architecture), docs/security-hardening-plan.md §4 Phase 3.

Create docs/runbook.md covering: prerequisites and access; first deploy
(provisioning, env vars for BOTH apps, migration + reference-data seed in the
documented order, first system_admin); routine deploy; running a migration
against a live database; rollback (application and schema); post-deploy smoke
verification (admin login, citizen report submission, a real password-reset
email, one photo upload, one cron trigger); common failures; who to contact.

CRITICAL: write this FROM A REAL DEPLOY you actually performed, not
speculatively. An untested runbook creates false confidence at exactly the
moment it matters. Mark irreversible steps clearly.

Reference — do not duplicate — README.md §D's migration order. Include the two
GitHub Actions cron values (issue #028) and the trust proxy finding (#006).

Link it from docs/deployment-readiness.md §9, README.md §J, CLAUDE.md's repo
layout, and docs/project-status.md §4.4.

Validation: have a teammate follow it end to end on staging without help. Every
question they ask is a gap to fix.

Verify: git diff --check
```
