# Add Content-Security-Policy in Report-Only mode

**Labels:** `security`, `priority:p3`, `frontend`
**Type:** Enhancement (security hardening)
**Priority:** P3 — **blocked by #002**, do that first

## Background

`docs/security-hardening-plan.md` R7 (Low). Deliberately split from #002 because CSP is the header that actually breaks things.

## Problem

No Content-Security-Policy exists. Low severity given React's escaping and the single reviewed `dangerouslySetInnerHTML` (stock shadcn `chart.tsx`, developer-supplied config only), but CSP is real defense-in-depth against injected script.

## Proposed scope

Add `Content-Security-Policy-Report-Only` to `next.config.ts`, observe what it would block, then decide separately whether to promote it to enforcing. **This issue ends at Report-Only plus a written findings summary** — promotion is a follow-up.

Sources that must be accounted for before any enforcing policy:

| Source | Needed for |
|---|---|
| Leaflet tile servers | Admin and citizen maps |
| Cloudinary | Report photos, resolution photos |
| Next.js inline styles / hydration | Framework behavior |
| Google OAuth endpoints | Login, if enabled |
| OpenWeatherMap | Server-side only — verify it needs no browser allowance |

## Implementation notes

- Start Report-Only. Do **not** ship an enforcing CSP in this issue.
- Without a report collection endpoint, violations surface in the browser console. That is acceptable for this pass — a reporting endpoint is not worth building yet.
- Exercise every visual surface after adding it: `/report`, `/map`, `/admin/map`, `/admin/tickets/[id]` (photos), `/admin` (charts).
- `'unsafe-inline'` for styles is likely unavoidable with Next + Tailwind. Note it rather than fighting it.

## Files likely involved

- `next.config.ts`
- `docs/security-hardening-plan.md` R7, `docs/project-status.md` §4.1

## Acceptance criteria

- [ ] `Content-Security-Policy-Report-Only` present on all page responses.
- [ ] No functional regression anywhere (Report-Only cannot block, so this is about confirming the app still behaves).
- [ ] A written summary of observed violations added to `docs/security-hardening-plan.md` R7 — what would break under enforcement.
- [ ] A clear recommendation recorded: promote as-is, promote with adjustments, or leave in Report-Only.

## Suggested tests

- Manual walkthrough of every visual surface with the console open, recording violations.
- One E2E asserting the header is present (extend #002's header spec).

## Out of scope

Promoting CSP to enforcing (follow-up, informed by this issue's findings), a violation-report collection endpoint, and any `nonce`-based script policy.

## Risks / notes

The temptation is to skip Report-Only and ship enforcing directly. Do not — an enforcing CSP that breaks the Leaflet map on a demo day is exactly the failure this staging avoids.

## Claude Code handoff prompt

```
Add a Content-Security-Policy in REPORT-ONLY mode to PORAC-SDSS.

Prerequisite: issue #002 (baseline security headers) should be done first.

Read first: next.config.ts, docs/security-hardening-plan.md R7,
node_modules/next/dist/docs/ for this build's headers() convention.

Add Content-Security-Policy-Report-Only (NOT the enforcing header) covering:
Leaflet tile servers, Cloudinary, Next.js inline styles/hydration, Google OAuth
(if configured). Verify whether OpenWeatherMap needs any browser-side allowance
— it may be server-side only.

Do NOT ship an enforcing CSP in this change. Do not build a violation-reporting
endpoint — console violations are sufficient for this pass.

Then manually exercise every visual surface with the browser console open:
/report (photo + Leaflet + pin), /map, /admin/map, /admin/tickets/[id] (photos),
/admin (charts). Record every violation observed.

Write the findings into docs/security-hardening-plan.md R7: what would break
under enforcement, and a clear recommendation (promote as-is / promote with
adjustments / stay Report-Only). Update docs/project-status.md §4.1.

Verify: pnpm build, then the manual walkthrough above. git diff --check
```
