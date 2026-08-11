# Fix citizen error boundaries to use the recovering retry prop

**Labels:** `reliability`, `priority:p2`, `frontend`
**Type:** Bug fix
**Priority:** P2 — small, but the current behavior is a silent no-op

## Background

`app/(citizen)/` has seven error boundaries: `account/`, `dashboard/`, `dashboard/reports/[id]/`, `map/`, `report/`, `reports/`, plus a `not-found.tsx`. All of them pass `reset` through to `CitizenErrorState`, which wires it to the "Try again" button:

```tsx
export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <CitizenErrorState ... reset={reset} ... />;
}
```

## Problem

This build's own documentation is explicit that `reset` is the wrong prop for this case:

> `reset()` **only clears the error state and re-renders without re-fetching**, which means it won't recover from Server Component errors. Use `unstable_retry()` in most cases.
>
> — `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`

Every one of these boundaries exists to catch a **failed SSR `apiGet`** — a Server Component error. So the "Try again" button users see is a no-op for exactly the failure it was built for. A user clicking it sees the same error screen again and has to reload manually.

## Proposed scope

Swap `reset` → `unstable_retry` in:

- `components/features/citizen/dashboard/CitizenErrorState.tsx` (prop name, type, and the `onClick` handler)
- The seven `app/(citizen)/**/error.tsx` files (prop rename pass-through only)

Behavior change: the retry button now re-fetches and can actually recover.

## Implementation notes

- This is a rename plus one handler change. No new components, no copy changes, no layout changes.
- **Verify the prop name against the local docs before starting** — `unstable_` prefixes move between versions, and this is a modified Next.js build (`AGENTS.md`).
- Consider whether to keep `reset` alongside `unstable_retry` for a secondary action. The docs mention both. Simpler is better here: one working button beats two confusing ones.
- If #011 has already landed, apply the same prop to the new boundaries for consistency.

## Files likely involved

- `components/features/citizen/dashboard/CitizenErrorState.tsx`
- `app/(citizen)/account/error.tsx`
- `app/(citizen)/dashboard/error.tsx`
- `app/(citizen)/dashboard/reports/[id]/error.tsx`
- `app/(citizen)/map/error.tsx`
- `app/(citizen)/report/error.tsx`
- `app/(citizen)/reports/error.tsx`

## Acceptance criteria

- [ ] All seven boundaries pass `unstable_retry`.
- [ ] `CitizenErrorState`'s button calls it.
- [ ] With the API stopped, a citizen page shows the boundary; restarting the API and clicking "Try again" **recovers the page without a manual reload**.
- [ ] `pnpm lint` and `pnpm build` pass.
- [ ] No visual or copy change.

## Suggested tests

- Manual: stop the API, load `/dashboard`, restart, click "Try again", confirm recovery.
- Run `e2e/citizen-reports.spec.ts` to confirm no regression.

## Out of scope

Adding new boundaries (#011), changing the error UI's appearance or copy, and any change to `lib/api-client.ts`.

## Risks / notes

Low risk. The failure mode being fixed is invisible in normal operation, which is exactly why it went unnoticed — nothing breaks today, the button just does not work.

## Claude Code handoff prompt

```
Fix PORAC-SDSS citizen error boundaries to use the recovering retry prop.

Read FIRST:
node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md
This is a MODIFIED Next.js (see AGENTS.md). The docs state that `reset()`
re-renders WITHOUT re-fetching and cannot recover a Server Component error, and
that `unstable_retry()` is the recovering prop. Confirm the exact prop name in
that file before editing — do not assume.

All seven app/(citizen)/**/error.tsx boundaries currently pass `reset` through
to components/features/citizen/dashboard/CitizenErrorState.tsx, whose "Try
again" button calls it. Since every one of these exists to catch a failed SSR
apiGet (a Server Component error), that button is a no-op for its actual
purpose.

Change: swap reset -> unstable_retry in CitizenErrorState.tsx (prop name, type,
onClick handler) and in the seven error.tsx files (pass-through rename only).

Do NOT add new boundaries (separate issue), change the UI appearance or copy,
or touch lib/api-client.ts.

Verify manually: stop the NestJS API, load /dashboard, confirm the boundary
renders. Restart the API, click "Try again", and confirm the page recovers
WITHOUT a manual browser reload. That is the whole point of the change.

Then: pnpm lint, pnpm build, and
pnpm exec playwright test e2e/citizen-reports.spec.ts -- --workers=1
Then git diff --check
```
