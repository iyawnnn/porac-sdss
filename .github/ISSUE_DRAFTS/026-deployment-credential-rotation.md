# Add a credential rotation checklist

**Labels:** `deployment`, `security`, `priority:p3`, `blocked`
**Type:** Chore (operational)
**Priority:** P3 — **blocked on a deploy decision** (`PLAN.md` §0 gates it deliberately)

## Background

`docs/deployment-readiness.md` §3 and §9. Development credentials must not become production credentials. `PLAN.md` §0 records credential rotation as deliberately deferred until an actual deployment.

Secrets in play (`api/src/config/env.ts`):

| Secret | Notes |
|---|---|
| `JWT_SECRET` | **Shared between both apps** — must be byte-identical. Rotating it invalidates every active session. |
| `CRON_SECRET` | Must match the GitHub Actions secret exactly, or all six cron jobs fail. |
| `DATABASE_URL` | Contains database credentials. |
| `CLOUDINARY_URL` | Contains the API secret. |
| `OPENWEATHERMAP_API_KEY` | — |
| `GOOGLE_CLIENT_SECRET`, `OAUTH_STATE_SECRET` | Only if OAuth is enabled. |
| `RESEND_API_KEY` | Only if email sending is enabled. |

## Problem

There is no rotation procedure and no record of which secrets have distinct production values. Two footguns are specific to this app:

- **`JWT_SECRET` lives in two files** (root `.env.local` and `api/.env`) and both apps verify the same cookies. Rotating one without the other breaks all authentication instantly.
- **`CRON_SECRET` lives in two places** (the API env and GitHub Actions secrets). A mismatch makes every scheduled job fail with 401 — and since nothing alerts on cron failure yet (#025), silently.

## Proposed scope

1. **Generate fresh production values** for every secret. None may be reused from development.
2. **Document the rotation procedure per secret**, including the blast radius of rotating each.
3. **Record the coordination requirements** — which secrets must be changed in two places simultaneously.
4. **Decide a rotation cadence**, or record a deliberate decision not to rotate on a schedule.
5. **Document what breaks during rotation** — `JWT_SECRET` rotation logs every user out; plan when to do it.

## Implementation notes

- **Never write an actual secret value into any documentation, issue, or commit.** Document the procedure and the variable names only.
- `JWT_SECRET` requires min 32 characters, `CRON_SECRET` min 16 — enforced by the Zod schema at boot.
- Rotating `DATABASE_URL` credentials likely requires a coordinated restart; note the downtime.
- Note that rotating `JWT_SECRET` is also the emergency response to a suspected session compromise — that makes the procedure worth having written down regardless of cadence.

## Files likely involved

- `docs/deployment-readiness.md` §3 and §10
- `docs/runbook.md` (#022)
- `docs/security.md` §8.1
- `docs/project-status.md` §4.4

## Acceptance criteria

- [ ] Every production secret is distinct from its development value.
- [ ] Per-secret rotation procedure written, with blast radius stated.
- [ ] Paired secrets (`JWT_SECRET` ×2 files, `CRON_SECRET` ×2 locations) clearly flagged.
- [ ] Rotation cadence decided, or a deliberate no-schedule decision recorded.
- [ ] Emergency `JWT_SECRET` rotation documented as the session-compromise response.
- [ ] **No secret value appears anywhere in the repo.**

## Suggested tests

- After rotating `CRON_SECRET`, trigger the cron workflow manually and confirm all six steps pass.
- After rotating `JWT_SECRET` in both files, confirm login works and that pre-rotation sessions are rejected.

## Out of scope

Secret-management infrastructure (Vault, cloud secret managers) — `docs/security-hardening-plan.md` §5.5 marks it not needed at this scale; two env files with one shared value is manageable. Also out: automated rotation.

## Risks / notes

The highest-risk step is rotating `JWT_SECRET` in only one of the two files. That breaks authentication for everyone with no obvious error message. Document it as a paired change and verify both sides.

## Claude Code handoff prompt

```
DO NOT START — blocked until a deployment decision is made for PORAC-SDSS
(PLAN.md §0 gates this deliberately).

When unblocked:

Read first: api/src/config/env.ts (the full secret list and its constraints),
README.md §C Step 4 (the two-env-file split), docs/deployment-readiness.md §3
and §9, docs/security.md §8.1, .github/workflows/cron.yml.

Produce a credential rotation checklist covering: JWT_SECRET, CRON_SECRET,
DATABASE_URL, CLOUDINARY_URL, OPENWEATHERMAP_API_KEY, and (if enabled)
GOOGLE_CLIENT_SECRET, OAUTH_STATE_SECRET, RESEND_API_KEY.

Two app-specific footguns to flag prominently:
- JWT_SECRET lives in BOTH root .env.local and api/.env and must be
  byte-identical. Rotating one without the other breaks all authentication
  instantly, with no obvious error.
- CRON_SECRET lives in BOTH the API env and GitHub Actions secrets. A mismatch
  makes all six cron jobs fail with 401 — silently, since nothing alerts on
  cron failure yet (#025).

For each secret document: how to rotate it, the blast radius, and whether it
requires a coordinated two-place change. Note that rotating JWT_SECRET logs
every user out, so it needs a chosen window — and that it is also the emergency
response to a suspected session compromise.

Decide a rotation cadence, or record a deliberate decision not to rotate on a
schedule.

NEVER write an actual secret value into documentation, an issue, or a commit.
Variable names and procedures only.

DO NOT introduce secret-management infrastructure (Vault, cloud secret
managers) — explicitly out of proportion here per
docs/security-hardening-plan.md §5.5.

Verify: after rotating CRON_SECRET, trigger the cron workflow manually and
confirm all six steps pass. After rotating JWT_SECRET in both files, confirm
login works and pre-rotation sessions are rejected. Then git diff --check
```
