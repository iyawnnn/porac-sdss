# Set and verify the GitHub Actions cron variables

**Labels:** `deployment`, `priority:p2`, `blocked`
**Type:** Chore (operational)
**Priority:** P2 within deployment — **blocked on a deployed API**, but the smallest item on the list

## Background

`docs/deployment-readiness.md` §6. `.github/workflows/cron.yml` calls all six `/cron/*` routes daily at **18:00 UTC (02:00 Asia/Manila)** — deliberately low-traffic hours — and can also be triggered manually via `workflow_dispatch`.

| Endpoint | What it does | Other trigger? |
|---|---|---|
| `recompute-urgency` | Recomputes urgency for active tickets | Yes — inline on dashboard/ticket loads |
| `recompute-weather` | Refreshes cached precipitation | Yes — inline |
| `cleanup-password-reset-tokens` | Deletes expired reset tokens | **No** |
| `cleanup-notifications` | Prunes read notifications past retention | **No** |
| `cleanup-rate-limit-events` | Prunes both rate-limit tables past 30 days | **No** |
| `check-ticket-escalations` | Flags stalled tickets, notifies the office | **No** |

**Four of the six have no other trigger.** If the workflow never runs successfully, those jobs never run at all.

## Problem

The workflow requires two repository-level configs that are not set:

- `vars.PORAC_API_BASE_URL` — the deployed API origin, **no trailing slash**
- `secrets.CRON_SECRET` — must match the deployed API's `CRON_SECRET` exactly

Until then the workflow runs on schedule but **skips calling any endpoint** — its own "Check deployment configuration" step checks for both values first and exits green when either is missing, rather than attempting requests that would fail with a connection error. **That is expected, not a bug to fix locally** — but it does mean the four unique jobs are not running.

## Proposed scope

1. Set repository variable `PORAC_API_BASE_URL` (Settings → Secrets and variables → Actions → Variables).
2. Set repository secret `CRON_SECRET`, matching the deployed API's value exactly.
3. Trigger the workflow manually via `workflow_dispatch` and confirm **all six steps pass**.
4. Confirm the next scheduled run also passes.
5. Decide whether a failed run should alert anyone (#025 covers the mechanism).

## Implementation notes

- **No trailing slash** on `PORAC_API_BASE_URL` — the workflow appends `/cron/...` directly, so a trailing slash produces a double slash.
- The workflow uses `curl -sf`, so an HTTP error fails the step visibly rather than passing silently. Good — trust it.
- A `CRON_SECRET` mismatch produces **401 on all six steps**, which is the most likely failure and looks identical to a wrong URL. Check the secret first.
- `CronSecretGuard` accepts `Authorization: Bearer $CRON_SECRET`, which is what the workflow sends.
- Coordinate with #026 — rotating `CRON_SECRET` later requires updating both places together.

## Files likely involved

- No files — this is GitHub repository configuration.
- `docs/deployment-readiness.md` §6 and §10 (mark done)
- `docs/project-status.md` §4.4

## Acceptance criteria

- [ ] `vars.PORAC_API_BASE_URL` set, no trailing slash.
- [ ] `secrets.CRON_SECRET` set and matching the deployed API.
- [ ] A manual `workflow_dispatch` run passes all six steps.
- [ ] The next scheduled run passes.
- [ ] The four no-other-trigger jobs verified to have actually done something (e.g. check that cleanup ran, or that the escalation check returned counts).
- [ ] A decision recorded on cron failure alerting.

## Suggested tests

- Manual `workflow_dispatch`, then read each step's output — the cron endpoints return counts (`{ candidatesFound, notificationsCreated, duplicatesSkipped }` for escalations), so the response bodies confirm the jobs actually did work rather than merely returning 200.

## Out of scope

Changing the schedule or the cron endpoints, adding new scheduled jobs, and alerting infrastructure (#025).

## Risks / notes

The two most likely failures are a trailing slash on the URL and a mismatched secret. Both produce failures on all six steps, so check both before debugging the API.

## Claude Code handoff prompt

```
DO NOT START — blocked until the PORAC-SDSS API is deployed and reachable at a
public origin.

When unblocked — this is the smallest deployment item:

Read first: .github/workflows/cron.yml (including its header comment),
api/src/cron/cron.controller.ts, api/src/common/guards/cron-secret.guard.ts,
docs/deployment-readiness.md §6.

This is GitHub repository configuration, not a code change:
1. Set repository VARIABLE PORAC_API_BASE_URL to the deployed API origin, with
   NO TRAILING SLASH (the workflow appends /cron/... directly).
2. Set repository SECRET CRON_SECRET to exactly the deployed API's CRON_SECRET.
3. Trigger the workflow manually (workflow_dispatch) and confirm all six steps
   pass.
4. Confirm the next scheduled run (18:00 UTC / 02:00 Manila) also passes.
5. Record a decision on whether a failed run should alert anyone (the mechanism
   is issue #025).

Why this matters: four of the six jobs — cleanup-password-reset-tokens,
cleanup-notifications, cleanup-rate-limit-events, and check-ticket-escalations
— have NO other trigger. If the workflow never succeeds, they never run.

Debugging note: a CRON_SECRET mismatch produces 401 on all six steps and looks
identical to a wrong URL. Check the secret and the trailing slash before
suspecting the API.

Verification: read each step's response body, not just its exit status. The
endpoints return counts (escalations returns candidatesFound /
notificationsCreated / duplicatesSkipped), which confirms the jobs actually did
work rather than merely returning 200.

Update docs/deployment-readiness.md §6/§10 and docs/project-status.md §4.4.
Then git diff --check
```
