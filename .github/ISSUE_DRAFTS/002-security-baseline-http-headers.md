# Add baseline HTTP security response headers

**Labels:** `security`, `priority:p1`, `frontend`
**Type:** Enhancement (security hardening)
**Priority:** P1 — best value-to-effort ratio in the hardening plan

## Background

`docs/security-hardening-plan.md` R2 (Medium). Neither `next.config.ts` nor the NestJS bootstrap (`api/src/main.ts`) sets any security response headers.

## Problem

The admin console can be framed by any origin, which makes clickjacking possible against destructive single-click admin controls — status advance, office reassignment, admin deactivation.

## Proposed scope

Add a `headers()` function to `next.config.ts` returning four static headers:

| Header | Value |
|---|---|
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | deny only what the app does not use |

**Deliberately excludes Content-Security-Policy** — that is issue #005, staged separately in Report-Only mode first, because a blocking CSP shipped blind will break Leaflet tiles, Cloudinary images, and Next's inline styles.

## Implementation notes

- Next.js serves all the HTML; the API returns JSON to a same-origin proxy. **No `helmet` dependency is needed on the API** — put the headers where the HTML is.
- These four are static values that cannot break uploads, OAuth callbacks, or the map. That is exactly why they are separated from CSP.
- Check `node_modules/next/dist/docs/` for this build's `headers()` convention first — this is a modified Next.js (see `AGENTS.md`).
- **Verify `Permissions-Policy` against the report form**, which uses browser geolocation for pin placement. Do not deny geolocation without checking.

## Files likely involved

- `next.config.ts`
- One `e2e/` header assertion (added to an existing spec)
- `docs/security.md` §2, `docs/security-hardening-plan.md` R2, `docs/project-status.md` §4.1

## Acceptance criteria

- [ ] All four headers present on an admin page response.
- [ ] All four present on a citizen page response.
- [ ] The report form's map, photo upload, and geolocation still work.
- [ ] The admin map (Leaflet) and Cloudinary images still render.
- [ ] Docs updated.

## Suggested tests

- One E2E spec asserting the four headers on `/admin/login` and one citizen route (`page.goto()` returns a response — read `response.headers()`).
- Manual: load `/report` and `/admin/map` and confirm nothing broke.
- Add to an existing spec; header checks need no report creation, so this adds nothing to the rate-limit budget.

## Out of scope

CSP (issue #005), HSTS (deployment-gated — needs TLS, see issue #026), any API-side `helmet`.

## Risks / notes

`Permissions-Policy` is the only one of the four that can break a feature. Enumerate what the app actually uses before denying anything.

## Claude Code handoff prompt

```
Add baseline HTTP security response headers to PORAC-SDSS.

Read first: next.config.ts, AGENTS.md, docs/security-hardening-plan.md R2, and
node_modules/next/dist/docs/ for this build's headers() convention (this is a
modified Next.js — do not assume the standard API).

Add a headers() function to next.config.ts applying to all routes:
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy: deny only features the app does not use. IMPORTANT: the
  citizen report form uses browser geolocation for pin placement — verify
  before denying it.

Do NOT add a Content-Security-Policy in this change (separate issue), do not
add helmet to the API (it serves JSON to a same-origin proxy), and do not
touch the /api/* rewrite config.

Add one E2E assertion for the four headers on an admin route and a citizen
route. Put it in an existing spec — do not create a spec that submits reports
(rate limit, see docs/testing.md §6).

Manually verify /report (photo + map + pin) and /admin/map (Leaflet +
Cloudinary images) still work.

Update docs/security.md §2, docs/security-hardening-plan.md (R2 done),
docs/project-status.md §4.1.

Verify: pnpm build, pnpm lint, git diff --check
```
