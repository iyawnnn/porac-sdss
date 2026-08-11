# Add failed-login throttling for admin login

**Labels:** `security`, `priority:p1`, `backend`
**Type:** Enhancement (security hardening)
**Priority:** P1 — highest-severity open security gap

## Background

`docs/security-hardening-plan.md` R1 (High). Admin login is protected today by exactly two things: bcrypt's hashing cost, and an enumeration-resistant generic error message. There is no attempt counter, no backoff, no cooldown.

`README.md` §G publishes the admin email convention (`meo@porac.gov.ph`, `mdrrmo@porac.gov.ph`, `sysadmin@porac.gov.ph`), and a real deployment would follow the same pattern — so an attacker needs no username-discovery step.

## Problem

An attacker who knows one admin address can make unlimited password guesses; only bcrypt's per-attempt cost slows them down. For a government-style system this is the gap a reviewer or panel finds first.

## Proposed scope

Per-account failed-attempt throttling with a temporary, self-clearing cooldown, following the Postgres-backed pattern `RateLimitService` already implements twice (report submission, password reset).

**Three design constraints — these are what make it correct:**

1. **Key on the normalized account email, NOT on IP. Count failures only; a successful login resets the counter.** An IP-based limit on *total* logins would break the E2E suite, which authenticates in nearly every one of ~200 tests from a single IP. Counting only failures leaves the suite green with **no test bypass** — see `docs/testing.md` §6 and `docs/security.md` §8.3.
2. **Temporary, self-clearing cooldown.** Minutes, not a permanent lock requiring admin intervention — that is itself a denial-of-service vector against municipal staff.
3. **Preserve enumeration resistance.** The throttled response must be indistinguishable from a normal failure. `auth.service.ts` already returns the same generic error for wrong password, nonexistent account, and deactivated admin.

Suggested starting values (name them as constants, justify in a comment): **10 failures within 15 minutes → 15-minute cooldown.**

## Implementation notes

- Reuse the existing rate-limit table if its columns fit; add a migration only if they genuinely do not.
- If you add a migration: follow `api/scripts/migrations/` conventions, add the `pnpm` script, and update **both** `README.md` §D and `CLAUDE.md`'s setup order — those lists must stay complete.
- Extend `POST /cron/cleanup-rate-limit-events` to prune the new rows, matching the existing 30-day retention rationale.
- No MFA, CAPTCHA, or device fingerprinting — explicitly out of scope per `docs/security-hardening-plan.md` §5.5.

## Files likely involved

- `api/src/auth/auth.service.ts`
- `api/src/domain/ratelimit.service.ts`
- `api/src/cron/cron.controller.ts` (cleanup extension)
- Possibly one migration in `api/scripts/migrations/` + an `api/package.json` script
- `docs/security.md` §5/§8, `docs/security-hardening-plan.md`, `docs/project-status.md` §4.1
- `docs/database.md`, `README.md` §D, `CLAUDE.md` — only if a table/column is added

## Acceptance criteria

- [ ] N failed attempts against one account trigger a cooldown.
- [ ] A successful login before the threshold resets the counter.
- [ ] The cooldown response is identical to a normal failed-login response — same status, same message.
- [ ] Throttle state survives an API restart (Postgres-backed, not in-memory).
- [ ] Old rows are pruned by the existing cleanup cron.
- [ ] `docs/security.md` §5 gains the control, and **"no failed-login lockout" is removed from §8.2** — it will no longer be true.
- [ ] `docs/security-hardening-plan.md` R1 marked done; `docs/project-status.md` §4.1 updated.

## Suggested tests

- Unit/API: N failures → cooldown; success before threshold resets; cooldown response indistinguishable from a normal failure.
- `pnpm --prefix api test`
- Run only `e2e/admin-password.spec.ts` and `e2e/admin-rbac.spec.ts`. **Do not run the full Playwright suite** (`docs/testing.md` §6).

## Out of scope

MFA/2FA, CAPTCHA, permanent lockout, citizen-side login throttling (citizens have no privileged access and no published address convention), IP-based *total* login limits, changes to the generic-error enumeration resistance, and any test-only bypass.

## Risks / notes

The main risk is keying on IP instead of per-account failures and breaking the E2E suite. Read `docs/testing.md` §6 before choosing the key.

## Claude Code handoff prompt

```
Implement per-account failed-login throttling for admin login in PORAC-SDSS.

Read first: api/src/auth/auth.service.ts, api/src/domain/ratelimit.service.ts,
docs/security.md §2/§5/§8, docs/security-hardening-plan.md R1, docs/testing.md §6.

Requirements:
- Postgres-backed, following the existing RateLimitService pattern (not in-memory).
- Key on normalized account email. Count FAILED attempts only; a successful
  login resets the counter. Do NOT key on IP — the E2E suite logs in ~200 times
  from one IP and an IP-based total-login limit would break it.
- Temporary self-clearing cooldown (suggest 10 failures / 15 min -> 15 min).
  Named constants with a justifying comment.
- The throttled response MUST stay indistinguishable from a normal failure.
  auth.service.ts already returns one generic error for wrong password,
  nonexistent account, and deactivated admin. Preserve that exactly.
- Reuse the existing rate-limit table if columns fit; only add a migration if
  not. If you add one, follow api/scripts/migrations/ conventions, add the pnpm
  script, and update BOTH README.md §D and CLAUDE.md's setup order.
- Extend POST /cron/cleanup-rate-limit-events to prune the new rows.

Do NOT: add MFA/CAPTCHA, add a test-only bypass or env flag, weaken the generic
error, or touch office scoping / guards / citizen auth.

Update in the same change: docs/security.md (§5 add; §8.2 remove the
"no failed-login lockout" limitation), docs/security-hardening-plan.md (R1
done), docs/project-status.md §4.1.

Verify: pnpm --prefix api test, then ONLY
pnpm exec playwright test e2e/admin-password.spec.ts e2e/admin-rbac.spec.ts -- --workers=1
Do not run the full suite. Then git diff --check
```
