# Add a better fallback UI when the API is unavailable

**Labels:** `reliability`, `priority:p3`, `frontend`
**Type:** Enhancement (UX)
**Priority:** P3 — **do #011 and #012 first**; this refines what they render

## Background

Once #011 and #012 land, a connection failure between Next.js and the API produces a *working* error boundary with a functioning retry. This issue is about making that boundary actually useful rather than generic.

## Problem

A generic "Something went wrong" tells a user nothing actionable. There are two very different failure classes behind it:

- **The API is unreachable** (socket-level failure — `lib/api-client.ts` throws with a `network error reaching` message after its bounded retries). Usually transient; retry genuinely helps.
- **The API responded with an error** (a non-OK status). Retrying the same request will usually produce the same result.

For a municipal tool where staff may be mid-triage, "the server is temporarily unreachable, try again" is a materially different message from "something went wrong."

## Proposed scope

Small, contained improvements to the boundaries added in #011/#012:

1. **Distinguish the two failure classes** where it can be done safely. `lib/api-client.ts` already throws a distinguishable error for connection failures. Note that in production Next.js replaces Server Component error messages with a generic string plus a `digest` — so **the message may not be readable on the client**. Verify what actually reaches the boundary before designing around it.
2. **Give the retry button a visible pending state** so a slow retry does not look like a dead button.
3. **Offer a sensible secondary action** — for admins, a link to `/admin/login`; for citizens, a link to `/reports`.
4. **Log the `digest`** in a way that lets a developer correlate with server logs.

## Implementation notes

- If the error message is not reliably readable in production, **do not fake specificity**. A single honest message is better than a wrong one. Say so in a comment and keep it generic.
- Keep this small. It is a UX polish pass on an already-working boundary, not a new subsystem.
- No new dependency, no telemetry service (monitoring is #025).

## Files likely involved

- `app/error.tsx`, `app/admin/error.tsx` (from #011)
- `components/features/citizen/dashboard/CitizenErrorState.tsx`
- Possibly `lib/api-client.ts` — **read-only inspection preferred**; do not change its retry behavior

## Acceptance criteria

- [ ] Retry button shows a pending state while retrying.
- [ ] Boundary offers a relevant secondary navigation action.
- [ ] Error `digest` is surfaced or logged for correlation.
- [ ] If failure-class distinction proves unreliable in production, the code says so in a comment and stays generic — no invented specificity.
- [ ] `pnpm lint` and `pnpm build` pass.

## Suggested tests

- Manual: stop the API, observe the message and the pending state; restart and retry.
- Manual: verify behavior in a production build (`pnpm build && pnpm start`), since Server Component error messages differ from dev.

## Out of scope

Error tracking or alerting integration (#025), retry/backoff changes in `lib/api-client.ts`, and offline support or service workers.

## Risks / notes

The main trap is designing around a `error.message` that Next.js strips in production. Verify in a production build, not just `pnpm dev`.

## Claude Code handoff prompt

```
Improve the PORAC-SDSS error-boundary fallback UI.

Prerequisites: issues #011 (SSR error boundaries) and #012 (unstable_retry)
should be done first — this refines what they render.

Read first: app/error.tsx and app/admin/error.tsx (from #011),
components/features/citizen/dashboard/CitizenErrorState.tsx, lib/api-client.ts
(read-only — do not change its retry logic),
node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md
(note what error.message contains in production vs development).

Scope, kept small:
1. Try to distinguish "API unreachable" (lib/api-client.ts throws a
   distinguishable network error) from "API returned an error". IMPORTANT:
   verify what actually reaches the boundary in a PRODUCTION build — Next
   replaces Server Component error messages with a generic string plus a
   digest. If the distinction is not reliable, do NOT fake it: keep one honest
   generic message and say why in a comment.
2. Add a visible pending state to the retry button.
3. Add a relevant secondary action (admin -> /admin/login, citizen -> /reports).
4. Surface or log the error digest so it can be correlated with server logs.

Do NOT add a telemetry/error-tracking service (separate issue), change
lib/api-client.ts retry behavior, add a dependency, or build offline support.

Verify in BOTH dev and a production build (pnpm build && pnpm start): stop the
API, observe the message and pending state, restart, retry.

Then: pnpm lint, pnpm build, git diff --check
```
