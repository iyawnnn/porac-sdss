# Add a monitoring and alerting checklist

**Labels:** `deployment`, `priority:p3`, `blocked`
**Type:** Chore (operational)
**Priority:** P3 — **blocked on a hosting decision**

## Background

`docs/deployment-readiness.md` §9. Monitoring is the least-developed area of the project, and honestly labelled as such: no error tracking, no uptime monitoring, no alerting, no log retention policy.

## Problem

Once deployed, nobody would know if:

- the API is down or crash-looping,
- a scheduled cron run failed (it currently fails silently outside the Actions UI),
- server-side errors are occurring,
- the OpenWeatherMap fetch is persistently failing (urgency scores would quietly fall back to a stale or 0mm rain value),
- the database is near a connection limit.

## Proposed scope

**Right-sized for a municipal system with a small team — not enterprise observability.** `docs/security-hardening-plan.md` §5.5 explicitly marks SIEM as not needed now.

1. **Uptime monitoring** for the frontend and the API — a simple external check with alerting is sufficient.
2. **Error tracking** — a hosted service with a free tier is reasonable; pick one, wire it into both apps, and confirm a deliberately-thrown error appears.
3. **Cron failure alerting** — GitHub Actions can notify on workflow failure; that may be enough and costs nothing.
4. **A minimal health endpoint** if one does not exist, for the uptime check to hit.
5. **Log access and retention** — decide what is kept, for how long, and who can read it. Note that audit trails live in the **database**, not logs, and follow the backup policy instead.

## Implementation notes

- Prefer what the chosen host already provides before adding a service.
- **Do not add SIEM, APM tracing, or a metrics stack.** Out of proportion for this system and explicitly deferred.
- The health endpoint must not leak version, dependency, or configuration detail to unauthenticated callers.
- If error tracking is added, ensure it never captures a reset token, session cookie, password, or unmasked citizen data. Scrubbing config must be reviewed before enabling.
- Decide who actually receives alerts — an alert with no recipient is decoration.

## Files likely involved

- Possibly `api/src/` (health endpoint, error-tracking init)
- Possibly `app/` (client-side error tracking)
- `.github/workflows/cron.yml` (failure notification)
- `docs/deployment-readiness.md` §9 and §10
- `docs/runbook.md` (#022)

## Acceptance criteria

- [ ] Uptime monitoring active for frontend and API, with a named alert recipient.
- [ ] Error tracking receiving events from both apps (verified with a deliberate test error).
- [ ] Cron workflow failure produces a notification.
- [ ] Health endpoint exists and leaks nothing sensitive.
- [ ] Error tracking verified to scrub tokens, cookies, passwords, and citizen PII.
- [ ] Log retention and access documented.

## Suggested tests

- Throw a deliberate error in each app; confirm it appears in the tracker with no sensitive data attached.
- Stop the API; confirm the uptime alert fires and reaches a person.
- Make a cron step fail deliberately; confirm the notification arrives.

## Out of scope

SIEM, APM/distributed tracing, a metrics/dashboard stack, on-call rotation, and log aggregation infrastructure. All explicitly not needed at this stage.

## Risks / notes

The real risk is over-building. Uptime + error tracking + cron alerts, each with a named recipient, covers the realistic failure modes for this system.

## Claude Code handoff prompt

```
DO NOT START — blocked until a hosting platform is chosen for PORAC-SDSS.

When unblocked:

Read first: docs/deployment-readiness.md §9 and §10,
docs/security-hardening-plan.md §5.5 (which explicitly marks SIEM as not needed
now), .github/workflows/cron.yml, api/src/main.ts.

Right-size this for a small team running a municipal system. Add:
1. Uptime monitoring for the frontend and the API, with a NAMED alert
   recipient (an alert nobody receives is decoration).
2. Error tracking in both apps — a free-tier hosted service is fine. Verify a
   deliberately thrown error arrives.
3. Cron failure alerting — GitHub Actions can notify on workflow failure, which
   may be sufficient and costs nothing. Today cron failures are silent outside
   the Actions UI.
4. A minimal health endpoint if none exists, for the uptime check. It must NOT
   leak version, dependency, or config detail to unauthenticated callers.
5. A decision on log retention and access. Note that audit trails live in the
   DATABASE, not logs, and follow the backup policy instead.

CRITICAL: before enabling error tracking, review its scrubbing config. It must
never capture password-reset tokens, session cookies, passwords, or unmasked
citizen PII.

DO NOT add: SIEM, APM/distributed tracing, a metrics/dashboard stack, on-call
rotation tooling, or log aggregation infrastructure. All explicitly out of
proportion here.

Prefer what the chosen host already provides before adding a third-party
service.

Verify: throw a test error in each app and confirm it arrives scrubbed; stop
the API and confirm the uptime alert reaches a person; fail a cron step
deliberately and confirm the notification arrives.

Update docs/deployment-readiness.md §9/§10, docs/runbook.md, and
docs/project-status.md §4.4. Then git diff --check
```
