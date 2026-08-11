# Review trust proxy behavior before deployment

**Labels:** `security`, `deployment`, `priority:p3`, `blocked`
**Type:** Chore (deployment-gated review)
**Priority:** P3 — **blocked on a hosting decision. Do not start before then.**

## Background

`docs/security-hardening-plan.md` R5 (Medium, deployment-gated). `api/src/main.ts` sets:

```ts
app.set('trust proxy', 1);
```

This is **correct today** — exactly one hop sits in front of the API (the Next.js `/api/*` rewrite), so Express reads the real client IP from `X-Forwarded-For`.

## Problem

The value `1` encodes an assumption about topology. Adding a CDN, load balancer, or platform edge proxy changes the hop count. With the wrong depth, a client-supplied `X-Forwarded-For` header can be trusted as the client IP — **defeating the IP-keyed report rate limit (20/hour) and password-reset limit (10/hour)**, both of which are real anti-abuse controls.

This cannot be fixed correctly before the topology exists. Guessing now would be worse than leaving it.

## Proposed scope

**After a hosting platform is chosen:**

1. Determine the real number of trusted proxy hops in front of the API.
2. Set `trust proxy` to match, and record the reasoning in a code comment.
3. Verify empirically that the observed client IP is the real client IP, not a proxy's and not a spoofable value.
4. Record the finding in the deployment runbook (#022).

## Implementation notes

- Express's `trust proxy: n` trusts the `n` hops closest to the server. Getting it wrong in either direction is a problem: too low and every client looks like the proxy (one shared bucket, over-limiting); too high and a forged header wins (under-limiting).
- Test with a deliberately forged `X-Forwarded-For` from outside the trusted chain and confirm it is **not** honored.

## Files likely involved

- `api/src/main.ts`
- The deployment runbook (#022)
- `docs/security-hardening-plan.md` R5, `docs/deployment-readiness.md` §7, `docs/project-status.md` §4.4

## Acceptance criteria

- [ ] `trust proxy` value matches the real deployed topology.
- [ ] A code comment states the topology it assumes.
- [ ] Empirically verified: the observed client IP is the true client IP.
- [ ] A forged `X-Forwarded-For` from an untrusted source does **not** change the observed IP.
- [ ] Rate limiting confirmed working against real IPs in the deployed environment.
- [ ] Runbook records the value and how to re-verify it.

## Suggested tests

- Manual, in the deployed environment: request from two different networks, confirm distinct IPs are recorded in `rate_limit_events`.
- Manual: send a forged `X-Forwarded-For` and confirm it is ignored.

## Out of scope

Everything until a hosting platform is chosen. Do not change `trust proxy` speculatively — the current value is correct for the current setup.

## Risks / notes

This is easy to forget precisely because nothing appears broken locally. It only manifests as silently ineffective rate limiting in production.

## Claude Code handoff prompt

```
DO NOT START — blocked until a hosting platform is chosen for PORAC-SDSS.

When unblocked:

Read first: api/src/main.ts, api/src/domain/ratelimit.service.ts,
docs/security-hardening-plan.md R5, docs/deployment-readiness.md §7.

api/src/main.ts sets `app.set('trust proxy', 1)`, correct for the current
single-hop topology (the Next.js /api/* rewrite). Determine the real hop count
in the chosen deployment, set the value to match, and add a code comment
stating the topology it assumes.

Then verify empirically in the deployed environment:
1. Requests from two different networks record two distinct IPs in
   rate_limit_events.
2. A forged X-Forwarded-For from an untrusted source does NOT change the
   observed client IP.
3. The IP-keyed report (20/hour) and password-reset (10/hour) limits actually
   fire against real client IPs.

Record the value and the re-verification procedure in the deployment runbook.
Update docs/security-hardening-plan.md R5 and docs/project-status.md §4.4.

Do not change trust proxy speculatively before the topology is known.
```
