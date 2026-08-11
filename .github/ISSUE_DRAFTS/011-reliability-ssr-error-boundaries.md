# Add root and admin SSR/API error boundaries

**Labels:** `reliability`, `priority:p1`, `frontend`
**Type:** Bug fix (missing error handling)
**Priority:** P1 — pending, not implemented

## Background

`docs/project-status.md` §4.2, `docs/security-hardening-plan.md` R10. **This is not done.** No app code has been written for it.

`app/admin/layout.tsx` and `app/admin/login/page.tsx` both call `getAdminSessionFromApi()` unguarded. That helper returns `null` on a 401, but **throws** when the Next → NestJS hop fails at the socket level (`lib/api-client.ts`, after its bounded retries). `app/(citizen)/layout.tsx` has the same shape.

There is no `app/error.tsx`, no `app/admin/error.tsx`, and no `global-error.tsx` anywhere in the tree.

## Problem

A transient connection failure between the two processes replaces the **entire admin app** — including the login form an admin would use to recover — with Next's built-in error screen. It is unbranded, offers no useful recovery, and in production would appear during any API restart or redeploy.

The only mitigation today is test-side: `settleAdminPage` in `e2e/helpers.ts` reloads when that screen appears. That helper exists because of this gap, and its comment says so.

## Proposed scope

**Two critical build-specific facts, both verified against this repo's own Next.js docs — read them before writing code:**

1. **`error.js` does NOT wrap the `layout.js` in its own segment.** Per `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`: *"It does not wrap the `layout.js` or `template.js` above it in the same segment."* So an `app/admin/error.tsx` alone would **not** catch a throw originating in `app/admin/layout.tsx`. A root `app/error.tsx` is what catches it, since the admin layout is nested below.
2. **The existing citizen boundaries use the wrong prop.** All seven `app/(citizen)/**/error.tsx` files pass `reset`, which the same docs describe as re-rendering *without* re-fetching — therefore unable to recover a Server Component error. **`unstable_retry` is the recovering prop in this Next version.** That is issue #012.

Scope here:

- Add `app/error.tsx` — catches admin and citizen layout throws. Branded, neutral for both audiences, working retry via `unstable_retry()`, and a link home.
- Add `app/admin/error.tsx` — branded admin page-level boundary, parity with the citizen side's six.

## Implementation notes

- Reuse existing `components/ui/` primitives. Check whether `CitizenErrorState` is genuinely reusable before building an admin twin.
- The root boundary covers both audiences — keep its copy neutral, not admin-specific.
- **Do not remove `settleAdminPage`** from `e2e/helpers.ts`. It also absorbs mid-run connection churn; update its comment to say the boundary now exists and it is defense-in-depth.

## Files likely involved

- `app/error.tsx` (new), `app/admin/error.tsx` (new)
- `e2e/helpers.ts` (comment only)
- `docs/security.md` §8.1, `docs/security-hardening-plan.md` R10, `docs/project-status.md` §4.2, `docs/features.md` §6, `docs/user-flows.md` §7

## Acceptance criteria

- [ ] With the API stopped, `/admin/login` renders the branded boundary, **not** Next's default screen.
- [ ] With the API stopped, `/admin` and a citizen page do the same.
- [ ] Restarting the API and clicking retry recovers the page **without a manual browser reload** — this is what proves `unstable_retry` was used rather than `reset`.
- [ ] `pnpm lint` and `pnpm build` pass.
- [ ] Docs updated; R10 marked done.

## Suggested tests

- Manual: stop the API, load the pages, restart, click retry.
- E2E is possible but awkward (it needs the API stopped mid-run) — manual verification is acceptable here; note it in the PR.
- Run `e2e/admin-shell.spec.ts` and `e2e/admin-tickets.spec.ts` to confirm no regression.

## Out of scope

Fixing the citizen boundaries' `reset` → `unstable_retry` (issue #012), `global-error.tsx` (that is for root-layout failures; `app/layout.tsx` does no data fetching), and any change to `lib/api-client.ts` retry counts — the throw is correct behavior, the missing boundary is the bug.

## Risks / notes

The single most likely mistake is adding only `app/admin/error.tsx` and assuming it fixes the layout throw. It does not. Verify against the local Next docs first.

## Claude Code handoff prompt

```
Add SSR/API error boundaries to PORAC-SDSS. This is currently PENDING — no code
exists for it yet.

Read FIRST, and verify each claim before coding:
- node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md
  This is a MODIFIED Next.js (see AGENTS.md) — do not rely on remembered APIs.
  Two facts matter: (a) error.js does NOT wrap the layout.js in its own segment,
  so app/admin/error.tsx alone will NOT catch a throw from app/admin/layout.tsx;
  (b) `reset` re-renders WITHOUT re-fetching and cannot recover a Server
  Component error — `unstable_retry` is the recovering prop.
- app/admin/layout.tsx, app/admin/login/page.tsx, app/(citizen)/layout.tsx,
  lib/api-client.ts, app/(citizen)/dashboard/error.tsx (existing pattern),
  docs/security-hardening-plan.md R10.

Create:
1. app/error.tsx ("use client") — the boundary that actually catches the
   admin/citizen LAYOUT throws. Branded, neutral for both audiences, retry via
   unstable_retry(), link home. No session data, no API calls.
2. app/admin/error.tsx ("use client") — admin page-level boundary, parity with
   the citizen side. Reuse components/ui primitives; check whether
   CitizenErrorState is reusable before building a twin.

Do NOT: fix the citizen boundaries' reset->unstable_retry (separate issue), add
global-error.tsx, change lib/api-client.ts retry logic, or remove
settleAdminPage from e2e/helpers.ts — update its comment to say the boundary
now exists and it is defense-in-depth.

Verify manually: stop the NestJS API, load /admin/login and /admin, confirm the
branded boundary renders instead of Next's default. Restart the API, click
retry, and confirm the page recovers WITHOUT a manual browser reload — that is
what proves unstable_retry was used.

Then: pnpm lint, pnpm build, and
pnpm exec playwright test e2e/admin-shell.spec.ts -- --workers=1

Update docs/security.md §8.1, docs/security-hardening-plan.md (R10 done),
docs/project-status.md §4.2, docs/features.md §6, docs/user-flows.md §7.
Then git diff --check
```
